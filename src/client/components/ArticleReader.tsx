import { CaretDown, ListBullets, Sparkle } from "@phosphor-icons/react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { parseArticleSections } from "@/shared/article-sections";
import type { FiveWOneH } from "@/shared/contracts";

import { requestChapterSummary } from "../lib/api";
import { FiveWOneHCard } from "./FiveWOneHCard";

interface ArticleReaderProps {
  article: string;
  completed: boolean;
  generationId?: string;
}

interface SummaryState {
  data?: FiveWOneH;
  error?: string;
  loading: boolean;
  open: boolean;
}

const markdownPlugins = [remarkGfm];

function articlePreamble(markdown: string): string {
  const headingIndex = markdown.search(/^##[ \t]+/m);
  return (headingIndex < 0 ? "" : markdown.slice(0, headingIndex)).trim();
}

function chapterBody(markdown: string): string {
  return markdown.replace(/^##[ \t]+.*(?:\r?\n|$)/, "").trim();
}

function Chapter({
  id,
  title,
  markdown,
  generationId,
}: {
  id: string;
  title: string;
  markdown: string;
  generationId: string;
}) {
  const [summary, setSummary] = useState<SummaryState>({ loading: false, open: false });

  async function toggleSummary() {
    if (summary.data) {
      setSummary((current) => ({ ...current, open: !current.open }));
      return;
    }

    setSummary({ loading: true, open: true });
    try {
      const data = await requestChapterSummary(generationId, id);
      setSummary({ data, loading: false, open: true });
    } catch (error) {
      setSummary({
        error: error instanceof Error ? error.message : "5W1H 总结生成失败",
        loading: false,
        open: true,
      });
    }
  }

  return (
    <section className="article-chapter" id={id}>
      <div className="chapter-heading">
        <h2>{title}</h2>
        <button
          className={`summary-button${summary.open ? " summary-button-open" : ""}`}
          type="button"
          onClick={toggleSummary}
          aria-label="生成 5W1H 总结"
          aria-expanded={summary.open}
        >
          <Sparkle aria-hidden="true" size={15} weight="fill" />
          5W1H
          <CaretDown aria-hidden="true" size={14} />
        </button>
      </div>
      {summary.open && (
        <FiveWOneHCard data={summary.data} error={summary.error} loading={summary.loading} />
      )}
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={markdownPlugins}>{chapterBody(markdown)}</ReactMarkdown>
      </div>
    </section>
  );
}

export function ArticleReader({ article, completed, generationId }: ArticleReaderProps) {
  if (!article) {
    return (
      <div className="empty-article">
        <div className="empty-icon"><ListBullets aria-hidden="true" size={24} /></div>
        <p>生成内容会从这里逐字出现</p>
        <span>完成后可对每个章节生成 5W1H 总结</span>
      </div>
    );
  }

  if (!completed || !generationId) {
    return (
      <div className="markdown-body streaming-markdown">
        <ReactMarkdown remarkPlugins={markdownPlugins}>{article}</ReactMarkdown>
        <span className="stream-caret" aria-hidden="true" />
      </div>
    );
  }

  const preamble = articlePreamble(article);
  const sections = parseArticleSections(article);

  return (
    <article className="completed-article">
      {preamble && (
        <div className="markdown-body article-preamble">
          <ReactMarkdown remarkPlugins={markdownPlugins}>{preamble}</ReactMarkdown>
        </div>
      )}
      {sections.map((section) => (
        <Chapter
          key={section.id}
          id={section.id}
          title={section.title}
          markdown={section.markdown}
          generationId={generationId}
        />
      ))}
    </article>
  );
}
