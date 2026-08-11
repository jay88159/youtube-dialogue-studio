# Interview Submission README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把仓库根目录 README 重构为面试提交的唯一入口，让评审按题目顺序找到地址、体验路径、五项实现说明与工程证据。

**Architecture:** 只修改现有 README 的信息结构与表述，不增加重复提交文档，不修改应用行为。正文保留现有代码和验证能够证明的事实，详细设计继续链接到 `docs/`。

**Tech Stack:** Markdown、Mermaid、GitHub README

## Global Constraints

- 只重构 `README.md` 和更新本计划的执行状态。
- 不修改业务代码、接口、Cloudflare 配置和既有验证结果。
- 仓库地址与生产地址必须位于首屏并可点击。
- 题目要求的五项说明必须有独立标题。
- 不写入敏感凭据、未验证指标和推测性产品结论。
- 分支和提交信息不包含用户禁止的词汇。

---

### Task 1: 重构面试提交 README

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-11-readme-submission-design.md`
- Modify: `docs/superpowers/plans/2026-08-11-readme-submission.md`

**Interfaces:**
- Consumes: 当前仓库实现、测试命令、生产地址和既有 `docs/` 文档
- Produces: 以 `README.md` 为唯一入口的可审阅提交说明

- [x] **Step 1: 重排首屏与评审路径**

  在 README 标题后加入提交信息、技术栈、参考视频和三步快速验收。保留现有生产截图，并增加到五项必答章节的目录链接。

- [x] **Step 2: 整理五项必答说明**

  保留字幕链路、Gemini 流式输出、用户要求和章节级 5W1H 的实现事实。新增独立的 **主要工程取舍和亮点** 章节，把散落的 NDJSON、Durable Object、两阶段生成、Fixture、代理和免费资源取舍集中为可检查的判断。

- [x] **Step 3: 压缩重复与宣传性表述**

  删除本地启动与线上快速体验的重复步骤。保留错误边界、测试、部署、目录和 AI coding 说明，并将深入内容链接到 `docs/ARCHITECTURE.md`、`docs/ARTICLE_OUTPUT_CONTRACT.md`、`docs/VERIFICATION.md` 和 `CLAUDE.md`。

- [x] **Step 4: 执行静态校验**

  Run:

  ```bash
  git diff --check
  rg -n '^## (如何获取和处理 YouTube 字幕|如何调用 Gemini 并实现流式输出|用户生成要求如何影响结果|章节级 5W1H 如何实现|主要工程取舍和亮点)$' README.md
  node -e 'const fs=require("node:fs"); const text=fs.readFileSync("README.md","utf8"); const fences=(text.match(/^```/gm)||[]).length; if(fences%2) throw new Error("unclosed code fence"); for(const match of text.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)){const target=match[1]; if(!/^(https?:|mailto:)/.test(target)&&!fs.existsSync(target)) throw new Error("missing link: "+target)}'
  rg -n 'AQ\.Ab8RN6J1qOLgeN15s-sWWuOkb49qAJDHasbbZRD-Qd0l3AykTQ' README.md
  ```

  Expected: diff 无空白错误，五个标题各出现一次，代码块闭合，相对链接存在，敏感 Key 无匹配。

- [x] **Step 5: 运行仓库检查**

  Run:

  ```bash
  pnpm check
  ```

  Expected: lint、TypeScript、单元测试、集成测试、E2E 和生产构建全部通过。

- [x] **Step 6: 提交并推送**

  ```bash
  git add README.md docs/superpowers/specs/2026-08-11-readme-submission-design.md docs/superpowers/plans/2026-08-11-readme-submission.md
  git commit -m "docs: prepare interview submission"
  git push origin main
  ```

  Expected: `HEAD` 与 `origin/main` 一致，GitHub CI 通过。
