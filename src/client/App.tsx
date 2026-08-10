import { Article, ArrowClockwise, GithubLogo, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";

import { ArticleReader } from "./components/ArticleReader";
import { GenerationForm } from "./components/GenerationForm";
import { SourceStatus } from "./components/SourceStatus";
import { useGeneration } from "./hooks/use-generation";

export function App() {
  const { state, generate, cancel } = useGeneration();
  const [lastRequest, setLastRequest] = useState<{ url: string; requirement?: string }>();
  const active = ["starting", "transcript", "generating"].includes(state.phase);

  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="逐章首页">
          <span className="brand-mark"><Article aria-hidden="true" size={18} weight="fill" /></span>
          <span>逐章</span>
        </a>
        <p>视频对话文章生成器</p>
        <a
          className="github-link"
          href="https://github.com/jay88159/youtube-dialogue-studio"
          target="_blank"
          rel="noreferrer"
          aria-label="查看 GitHub 仓库"
        >
          <GithubLogo aria-hidden="true" size={20} />
        </a>
      </header>

      <main className="workspace">
        <aside className="control-panel">
          <div className="panel-intro">
            <span className="eyebrow">YouTube → 中文对话文章</span>
            <h1>把长视频，读成一场有重点的对话。</h1>
            <p>读取字幕、流式生成文章，再按章节提炼 5W1H。</p>
          </div>

          <GenerationForm
            active={active}
            onCancel={cancel}
            onSubmit={(request) => {
              setLastRequest(request);
              void generate(request);
            }}
          />

          <SourceStatus
            phase={state.phase}
            source={state.source}
            segmentCount={state.segmentCount}
          />

          {state.phase === "error" && state.error && (
            <div className="generation-error" role="alert">
              <WarningCircle aria-hidden="true" size={20} weight="fill" />
              <div>
                <strong>本次生成未完成</strong>
                <p>{state.error.message}</p>
                {state.error.retryable && lastRequest && (
                  <button type="button" onClick={() => void generate(lastRequest)}>
                    <ArrowClockwise aria-hidden="true" size={15} />
                    重试
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="privacy-note">
            <span>会话上下文保留 24 小时</span>
            <span aria-hidden="true">·</span>
            <span>不在浏览器保存 API Key</span>
          </div>
        </aside>

        <section className="reader-panel" aria-label="生成的文章">
          <div className="reader-toolbar">
            <div>
              <span className="reader-label">输出预览</span>
              {state.article && <small>{state.article.length.toLocaleString("zh-CN")} 字符</small>}
            </div>
            {state.phase === "completed" && <span className="completion-mark">已完成</span>}
          </div>
          <div className="reader-scroll">
            <ArticleReader
              key={state.generationId ?? "empty"}
              article={state.article}
              completed={state.phase === "completed"}
              generationId={state.generationId}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
