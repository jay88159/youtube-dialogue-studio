# 生产验证记录

验证日期：2026-08-10  
生产地址：<https://youtube-dialogue-studio.delightful-lock.workers.dev>

这份记录区分三类证据：可重复的本地测试、真实外部服务 smoke test、真实浏览器交互。外部服务测试不进入公开 CI，避免 YouTube 验证与 Gemini 免费配额让确定性检查随机失败。

## 1. 本地与 CI

`pnpm check` 覆盖 ESLint、TypeScript strict、32 个单元测试、2 个 workerd + Durable Object 集成测试、6 个 Chromium 多视口端到端测试和 Cloudflare 生产构建。

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
