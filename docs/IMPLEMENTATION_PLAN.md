# 视频成稿 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建并公开部署一个基于 Cloudflare Workers、React 和 Gemini 的 YouTube 字幕转中文对话文章应用。

**Architecture:** 单个 Worker 同时服务 Vite 静态资源和 Hono API。每次生成由一个 SQLite-backed Durable Object 保存字幕、文章和章节状态，主文章通过 NDJSON 流式返回，5W1H 从服务端上下文生成。

**Tech Stack:** Node.js 22、TypeScript、React、Vite、Hono、Cloudflare Workers、Durable Objects、Vitest、Testing Library、Playwright、Gemini REST API。

## Global Constraints

- 所有 Cloudflare 资源必须运行在免费计划。
- 主文章必须真实流式输出并实时展示。
- 5W1H 请求不得由前端重新提交字幕、文章或章节正文。
- 参考视频 Fixture 必须在界面标明为演示字幕。
- Secret 不得进入 Git、日志或浏览器响应。
- 分支和提交信息不得包含 `codex`。

---

### Task 1: 工程基线与共享协议

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `eslint.config.js`
- Create: `src/shared/contracts.ts`, `src/shared/youtube-url.ts`, `src/shared/article-sections.ts`, `src/shared/ndjson.ts`
- Test: `tests/unit/shared/*.test.ts`

**Interfaces:**
- Produces: `parseYouTubeUrl(url): ParsedVideoUrl`, `parseArticleSections(markdown): Chapter[]`, `decodeNdjson(stream): AsyncIterable<GenerationEvent>`

- [ ] 写 URL、章节和任意分块 NDJSON 的失败测试。
- [ ] 运行 `pnpm vitest run tests/unit/shared`，确认因模块缺失失败。
- [ ] 写最小纯函数实现并补齐共享 TypeScript 联合类型。
- [ ] 再次运行测试，确认共享协议测试通过。
- [ ] 提交 `feat: establish shared generation contracts`。

### Task 2: 字幕领域

**Files:**
- Create: `src/worker/transcript/types.ts`, `normalizer.ts`, `youtube.ts`, `resolver.ts`, `fetch-transport.ts`, `tcp-proxy-transport.ts`
- Create: `fixtures/xRh2sVcNXQ8.json`
- Test: `tests/unit/transcript/*.test.ts`

**Interfaces:**
- Consumes: `ParsedVideoUrl`
- Produces: `TranscriptResolver.resolve(videoId): Promise<ResolvedTranscript>`

- [ ] 写 caption track 提取、json3 标准化、验证码识别和三级回退失败测试。
- [ ] 运行目标测试并确认真实行为缺失。
- [ ] 实现常量主机的直连传输和 YouTube 字幕解析。
- [ ] 实现 `cloudflare:sockets` CONNECT、TLS 升级和 HTTP/1.1 响应解析。
- [ ] 加入带来源元数据的参考字幕夹具。
- [ ] 运行字幕测试，确认每条回退路径通过。
- [ ] 提交 `feat: resolve youtube transcripts with honest fallbacks`。

### Task 3: Gemini 与提示词

**Files:**
- Create: `src/worker/gemini/client.ts`, `prompts.ts`, `sse.ts`, `five-w-one-h.ts`
- Test: `tests/unit/gemini/*.test.ts`

**Interfaces:**
- Produces: `GeminiClient.streamArticle(input): AsyncIterable<string>`, `GeminiClient.summarizeChapter(input): Promise<FiveWOneH>`

- [ ] 写跨网络分块 SSE、提示词注入边界和六字段校验失败测试。
- [ ] 运行目标测试并确认缺失行为导致失败。
- [ ] 实现 Gemini REST 调用、SSE 解析和结构化输出校验。
- [ ] 运行 Gemini 单元测试并检查错误映射。
- [ ] 提交 `feat: add gemini streaming and structured summaries`。

### Task 4: Durable Object 与 API

**Files:**
- Create: `src/worker/generation-session.ts`, `app.ts`, `index.ts`, `errors.ts`, `security.ts`
- Test: `tests/integration/generation-flow.test.ts`

**Interfaces:**
- Consumes: `TranscriptResolver`, `GeminiClient`, shared contracts
- Produces: `POST /api/generations`, `POST /api/generations/:generationId/chapters/:chapterId/5w1h`

- [ ] 写集成测试，证明 delta 先于 completed，状态被保存，5W1H 请求不含文章。
- [ ] 运行 `pnpm test:integration`，确认路由和对象缺失导致失败。
- [ ] 实现 Hono 入口、Durable Object 状态机、Alarm 清理和 NDJSON 输出。
- [ ] 运行集成测试并确认流式顺序、失败事件和总结上下文通过。
- [ ] 提交 `feat: persist generation sessions at the edge`。

### Task 5: React 产品界面

**Files:**
- Create: `index.html`, `src/client/main.tsx`, `App.tsx`, `styles.css`
- Create: `src/client/components/*.tsx`, `src/client/hooks/use-generation.ts`
- Test: `tests/unit/client/*.test.tsx`

**Interfaces:**
- Consumes: Worker API and `GenerationEvent`
- Produces: 可访问的生成表单、流式文章、章节 5W1H 面板

- [ ] 写表单校验、增量显示、Fixture 标记和六字段渲染失败测试。
- [ ] 运行客户端测试，确认组件缺失导致失败。
- [ ] 实现双栏工作台、响应式单栏、系统深色模式和完整交互状态。
- [ ] 运行组件测试并检查键盘语义与错误反馈。
- [ ] 提交 `feat: build the streaming article workspace`。

### Task 6: 端到端、文档与交付

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/generation.spec.ts`, `.github/workflows/ci.yml`, `.dev.vars.example`, `.gitignore`, `README.md`
- Modify: `docs/ARCHITECTURE.md`, `CLAUDE.md`

**Interfaces:**
- Produces: 可重复的本地验证、CI、部署命令和提交说明

- [ ] 写 Fixture 端到端测试，覆盖提交、流式正文、来源标记和 5W1H 六字段。
- [ ] 运行端到端测试，确认完整用户路径。
- [ ] 执行 `pnpm lint && pnpm typecheck && pnpm test && pnpm test:integration && pnpm test:e2e && pnpm build`。
- [ ] 在 390px、768px 和 1440px 检查页面截图及系统深色模式。
- [ ] 更新 README，记录字幕、Gemini 流、用户约束、5W1H、取舍、测试和部署。
- [ ] 提交 `docs: document architecture and delivery evidence`。
- [ ] 创建公开 GitHub 仓库并推送当前分支。
- [ ] 配置 Cloudflare Secret，执行 `pnpm deploy`，用公开 URL 完成 smoke test。
