# 生产验证记录

验证日期：2026-08-11
生产地址：<https://youtube-dialogue-studio.delightful-lock.workers.dev>

这份记录区分三类证据：可重复的本地测试、真实外部服务 smoke test、真实浏览器交互。外部服务测试不进入公开 CI，避免 YouTube 验证与 Gemini 免费配额让确定性检查随机失败。

## 1. 本地与 CI

`pnpm check` 覆盖 ESLint、TypeScript strict、37 个单元测试、2 个 workerd + Durable Object 集成测试、6 个 Chromium 多视口端到端测试和 Cloudflare 生产构建。

公开仓库的 GitHub Actions 使用相同的 `pnpm check`；CI 不注入任何 Secret。

## 2. 真实 Gemini 流式输出

对参考视频发起生产请求，记录到以下事件时序：

| 事件 | 相对请求时间 |
| --- | ---: |
| `generation.created` | 1.65 s |
| `transcript.ready` | 2.31 s |
| 第一个 `article.delta` | 3.65 s |
| `article.completed` | 7.37 s |

一次请求共收到 38 个 `article.delta`，且第一个增量比完成事件早 3.72 秒抵达。这是 HTTP 响应到达时序，不是前端把完整文章拆开后的打字动画。

## 3. 自然语言要求

生产请求使用：

> 面向零基础创业者，用清晰比喻解释商业判断；不要使用技术行话；每章末尾给出一句行动提示

结果生成 3 个章节、1834 个正文字符，并出现 4 条“行动提示”。标题和正文均体现目标受众、表达风格与约束，但没有改变服务端的事实忠实度和 Markdown 协议。

## 4. 章节 5W1H

浏览器只提交路径中的 `generationId` 和 `chapterId`，POST 请求体为空。服务端从同一个 Durable Object 读取字幕、整篇文章、章节索引与目标章节，再调用 Gemini。

真实生产请求返回 HTTP 200，结构恰好包含 `who / what / when / where / why / how` 六个非空字符串。测试过程中也捕获并修正了 Gemini `generateContent` 对响应 MIME 枚举的严格校验问题；对应回归测试固定了 `APPLICATION_JSON` 协议值。

## 5. 浏览器验收

在公开网址上用 Chromium 完成了“填入示例 → 生成 → 等待文章 → 展开章节 5W1H”的真实路径，确认：

- 页面显示“演示字幕”来源，不把 Fixture 冒充实时字幕；
- 文章出现 3 个章节，正文按 Markdown 渲染；
- 章节按钮返回 6 个非空字段；
- 桌面、平板深色模式、390 px 移动视口均无横向溢出。

![公开生产环境的完整生成与 5W1H 结果](images/product-workspace.png)

## 6. 重复执行生产 smoke test

```bash
pnpm test:smoke

# 验证其他部署
BASE_URL=https://example.workers.dev pnpm test:smoke
```

脚本只输出事件数量与耗时，不输出文章、提示词或 Secret。每次执行会真实消耗 Gemini 免费额度，因此不属于默认 `pnpm check`。

## 7. YouTube 验证码与代理复盘

使用用户提供的 10 个 Webshare 免费节点做了不回显凭据的目标探测：

- 10/10 节点通过普通 HTTP CONNECT 访问 YouTube 时连接中止；
- 10/10 节点通过 SOCKS5 从本机访问同一 YouTube 页面时返回 HTTP 200；
- 选择第 1、2、10 个节点分别配置到 Cloudflare 做代表性复测，均未取得实时字幕；其中第 1 个节点对无 Fixture 视频暴露出 `TLS Handshake Failed`。这证明本机可用不能直接外推为 Worker 运行时可用。

因此生产环境没有把这组节点保留为必经路径。代理实现仍是 best-effort 可选层，最终可用性由目标站点、代理节点和 Cloudflare TCP/TLS 组合决定；不能因为代理文件格式正确就宣称验证码问题已解决。

为保证公开演示对其他视频也有可恢复路径，系统增加了 Gemini YouTube URL Preview 最终兜底，并明确标记为「AI 视频转录」。真实生产请求使用非 Fixture 视频 `9hE5-98ZeCg` 验证得到：

- `transcript.ready.source = gemini`；
- 15 个结构化时间片段；
- 文章生成完成并形成 2 个章节；
- 后续章节 5W1H 使用空请求体，返回 HTTP 200 和 6 个非空固定字段。

这条路径不冒充 YouTube 原始字幕。官方当前说明 YouTube URL Preview 免费提供，免费层每天最多处理 8 小时公开视频，但 Preview 价格和限制可能变化。

## 8. 长视频结构化输出截断复盘

真实长视频曾返回约 50 KB 的未闭合 JSON，错误为 `Unterminated string`。根因不是字幕解析器，而是视频结构化输出在字符串中途达到请求的输出 token 上限；原提示词要求近似完整转录，Schema 又没有限制数组和字段规模。

修复后，标准档通过提示词限制 96 个片段、通过 Schema 限制每段 240 字，并把输出上限提高到模型支持范围内的 32,768 tokens；运行时再次校验两项边界。Gemini 当前结构化输出子集会拒绝数组 `maxItems`，所以没有把一个未经真实 API 验证的关键字留在线上。客户端同时读取候选结果的 `finishReason`：遇到 `MAX_TOKENS` 或结构化结果非法时，自动用 48 个片段、每段 180 字的紧凑档重试一次。单元回归测试模拟第一次在 JSON 字符串中途截断、第二次成功，明确断言发生两次请求且重试边界更小。

修复请求还绕过 Fixture，直接让 Gemini 处理 67 分钟参考视频：HTTP 200，108 秒完成，`finishReason = STOP`，返回 14 个覆盖全片的结构化片段，JSON 可解析，最长片段 191 字。

部署后再次使用非 Fixture 视频 `9hE5-98ZeCg` 走完整公开 API：HTTP 200，19 秒完成，`transcript.ready.source = gemini`，收到 5 个内容片段、10 个实时正文增量和 2 个章节，没有出现固定格式错误。

## 9. 编辑工作台重设计验收

重设计保留左侧输入、右侧阅读、流式状态和章节 5W1H 的既有信息架构，移除了径向渐变、悬浮双卡片、发光品牌块、标签胶囊以及 Magic Wand、Sparkle 等泛 AI 图标。视觉系统改为平面分栏、冷中性纸面和单一朱橙强调色；设计审计与约束见 `docs/FRONTEND_DESIGN.md`。

本地 Playwright 在 1440 px 亮色、768 px 深色和 390 px 手机三个项目中完成生成与 5W1H 路径，并断言页面 `scrollWidth <= clientWidth`。按钮与正文的实测对比度分别为 4.57:1、6.02:1，暗色模式分别为 5.83:1、7.74:1。

部署后用真实 Chromium 访问公开地址并生成参考视频：9 秒完成，页面进入“阅读模式”，出现 3 个章节、演示字幕来源和 6 个非空 5W1H 字段；视口宽度 1440 px 时没有横向溢出，浏览器控制台没有错误。README 截图来自这次公开生产请求，不是 mock 页面。

重设计没有新增运行时依赖。生产构建中，客户端 JavaScript 从 402.00 kB / gzip 121.47 kB 降至 391.38 kB / gzip 119.02 kB，CSS 从 12.62 kB / gzip 3.76 kB 降至 12.40 kB / gzip 3.46 kB，主要来自删除不必要的装饰图标与旧样式。
