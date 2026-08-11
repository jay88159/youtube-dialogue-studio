import { CheckCircle, Database, GlobeSimple, SpinnerGap, WarningCircle } from "@phosphor-icons/react";

import type { TranscriptSource } from "@/shared/contracts";
import type { GenerationPhase } from "../hooks/use-generation";

const sourceLabels: Record<TranscriptSource, string> = {
  direct: "YouTube 实时字幕",
  proxy: "代理字幕",
  fixture: "演示字幕",
  gemini: "AI 视频转录",
};

interface SourceStatusProps {
  phase: GenerationPhase;
  source?: TranscriptSource;
  segmentCount?: number;
}

export function SourceStatus({ phase, source, segmentCount }: SourceStatusProps) {
  if (phase === "idle") return null;

  const inProgress = phase === "starting" || phase === "transcript" || phase === "generating";
  const statusLabel = phase === "starting"
    ? "正在建立生成会话"
    : phase === "transcript"
      ? "正在读取字幕或视频内容"
      : phase === "generating"
        ? "文章生成中"
        : phase === "completed"
          ? "生成完成"
          : "生成中断";

  return (
    <div className={`source-status source-status-${phase}`} aria-live="polite">
      <div className="status-line">
        {inProgress ? (
          <SpinnerGap className="spin" aria-hidden="true" size={17} />
        ) : phase === "error" ? (
          <WarningCircle aria-hidden="true" size={17} weight="fill" />
        ) : (
          <CheckCircle aria-hidden="true" size={17} weight="fill" />
        )}
        <span>{statusLabel}</span>
      </div>
      {source && (
        <div className={`source-pill source-${source}`}>
          {source === "fixture" ? <Database aria-hidden="true" size={15} /> : <GlobeSimple aria-hidden="true" size={15} />}
          <span>{sourceLabels[source]}</span>
          {segmentCount ? <small>{segmentCount} 段</small> : null}
        </div>
      )}
      {source === "fixture" && (
        <p className="fixture-note">实时字幕不可用，当前使用内置完整字幕快照，结果仅用于演示。</p>
      )}
      {source === "gemini" && (
        <p className="fixture-note">实时字幕不可用，当前由 Gemini 从公开视频提取；这不是 YouTube 原始字幕，可能存在转录误差。</p>
      )}
    </div>
  );
}
