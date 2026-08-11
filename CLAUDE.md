# AI 协作约束

## 产品目标

本仓库实现一个部署在 Cloudflare Workers 的 YouTube 字幕转中文对话文章工具。主文章必须真实流式输出。章节 5W1H 必须读取服务端上下文。

## 工作原则

1. 修改前先阅读 `docs/ARCHITECTURE.md` 和相关测试。
2. 新行为先写失败测试，确认失败原因，再写最小实现。
3. 每个文件只承担一个可描述的职责。不要为单次调用创建通用框架。
4. 不改变题目范围。账号、历史列表、向量数据库和多模型路由不在范围内。
5. 不在日志、测试夹具、提交记录或文档中写入任何 Secret。
6. 不把字幕夹具描述为实时 YouTube 结果。
7. 不把 Gemini 视频转录描述为 YouTube 原始字幕；来源必须在页面可见。
8. Gemini 视频兜底必须使用有界内容地图；长视频输出截断时只允许一次更紧凑的自动重试，不恢复为无界逐字稿。Schema 只是模型约束，服务端必须确定性收口模型越界数据。
9. 不允许前端向 5W1H 接口提交字幕、全文或章节正文。
10. 模型输出只能作为不可信文本渲染，不启用原始 HTML。
11. 前端保持编辑工作台语言：单一强调色、平面分栏、无装饰渐变和泛 AI 图标；交互控件统一 8 px 圆角。

## 架构边界

- `src/client` 负责浏览器交互和展示。
- `src/worker` 负责 API、Durable Object、字幕和 Gemini 调用。
- `src/shared` 只放浏览器与 Worker 都使用的协议和纯函数。
- `fixtures` 保存可审计的参考字幕。
- `tests` 按 unit、integration、e2e 分层。

禁止从 `src/shared` 导入 Worker 或 React 运行时。字幕传输、字幕解析和 Gemini 提示词保持独立。

## 质量命令

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
```

提交前执行 `pnpm check`。涉及页面布局时检查 390px、768px 和 1440px，并验证系统深色模式、键盘焦点、错误状态和 reduced motion。

## Git 约束

- 分支使用 `feature/`、`fix/` 或 `docs/` 前缀。
- 提交采用 Conventional Commits，例如 `feat: stream generated article`。
- 分支名和提交信息不得包含 `codex`。
- 每次提交只包含一个可独立解释和验证的改动。

## 完成定义

- 题目每条要求在 README 中能映射到实现文件和验证证据。
- 流式测试证明增量事件先于完成事件。
- 5W1H 集成测试证明请求体不含文章内容。
- 页面显示内容来源，Fixture 有明确演示标记，Gemini 视频兜底有明确 AI 转录标记。
- 完整检查、生产构建和公开部署均成功。
