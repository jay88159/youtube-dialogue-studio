# Editorial Workbench Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有 AI 模板式页面改成克制、可读、可验证的编辑工作台，同时保持全部业务行为不变。

**Architecture:** 继续使用现有 React 组件边界和单份原生 CSS。`App` 只调整页面语义结构，表单、状态、文章和 5W1H 组件只调整文案与表现类名；Worker、API 和共享协议不变。

**Tech Stack:** React 19、TypeScript、原生 CSS variables、Phosphor Icons、Vitest、Playwright。

## Global Constraints

- 不新增运行时依赖。
- 不修改 API、状态机、请求体和可访问性标签。
- 单一朱橙强调色；无渐变、外发光、玻璃材质和装饰胶囊。
- 结构平面化；交互控件统一 8 px 圆角。
- 系统明暗模式、390/768/1440 px 和 reduced motion 必须继续工作。

---

### Task 1: 页面语义与文案

**Files:**
- Modify: `src/client/App.tsx`
- Modify: `src/client/components/GenerationForm.tsx`
- Modify: `src/client/components/ArticleReader.tsx`
- Modify: `src/client/components/FiveWOneHCard.tsx`
- Test: `tests/unit/client/app.test.tsx`

**Interfaces:**
- Consumes: 现有 `useGeneration()`、`GenerationFormProps`、`ArticleReaderProps`。
- Produces: 不变的组件签名和测试可访问名称。

- [x] 保留现有 label、button accessible name 和状态语义，删除 Magic Wand、Sparkle 与标签胶囊。
- [x] 把营销化文案改成任务导向文案，并为读者工具栏提供阶段元数据。
- [x] 更新单元测试，断言新标题存在且生成与 5W1H 请求协议不变。
- [x] 运行 `pnpm exec vitest run tests/unit/client/app.test.tsx`。

### Task 2: 编辑台视觉系统

**Files:**
- Modify: `src/client/styles.css`

**Interfaces:**
- Consumes: Task 1 保留的现有类名和新增的少量语义类名。
- Produces: 亮色、暗色、桌面、平板、手机四组确定性样式。

- [x] 用 CSS variables 定义纸面、石墨、朱橙、语义状态和焦点颜色。
- [x] 将桌面布局改为平面分栏，移除卡片阴影、背景渐变和结构圆角。
- [x] 将 5W1H 改为定义列表，把空状态和状态区改成稀疏编辑布局。
- [x] 保留 loading、error、focus、active 和 reduced-motion 状态。
- [x] 运行 `pnpm lint && pnpm typecheck && pnpm test:e2e`。

### Task 3: 视觉与交付证据

**Files:**
- Modify: `tests/e2e/app.spec.ts`
- Modify: `docs/images/product-workspace.png`
- Modify: `docs/VERIFICATION.md`

**Interfaces:**
- Consumes: Playwright 的三个既有 viewport project。
- Produces: 横向溢出、核心状态和新视觉截图的可复验证据。

- [x] 增加页面无横向溢出和核心编辑台标题可见断言。
- [x] 在 1440 px 完整生成态截取新的产品图，人工检查 768 px 深色与 390 px 手机布局。
- [x] 运行 `pnpm check`，确认所有本地门禁通过。
- [x] 部署后在公开地址完成真实浏览器 smoke test。
- [ ] 提交信息使用 `feat: redesign the editorial workspace`，然后推送 `main` 并等待 CI。
