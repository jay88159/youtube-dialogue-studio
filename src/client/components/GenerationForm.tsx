import { ArrowRight, LinkSimple, StopCircle } from "@phosphor-icons/react";
import { type FormEvent, useState } from "react";

import type { GenerationRequest } from "@/shared/contracts";
import { InvalidYouTubeUrlError, parseYouTubeUrl } from "@/shared/youtube-url";

const DEMO_URL = "https://www.youtube.com/watch?v=xRh2sVcNXQ8";

interface GenerationFormProps {
  active: boolean;
  onCancel: () => void;
  onSubmit: (request: GenerationRequest) => void;
}

export function GenerationForm({ active, onCancel, onSubmit }: GenerationFormProps) {
  const [url, setUrl] = useState("");
  const [requirement, setRequirement] = useState("");
  const [validationError, setValidationError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const parsed = parseYouTubeUrl(url);
      setValidationError("");
      onSubmit({
        url: parsed.canonicalUrl,
        requirement: requirement.trim() || undefined,
      });
    } catch (error) {
      setValidationError(error instanceof InvalidYouTubeUrlError
        ? error.message
        : "无法解析这个链接");
    }
  }

  return (
    <form className="generation-form" onSubmit={submit} noValidate>
      <div className="field-group">
        <div className="field-heading">
          <label htmlFor="video-url">YouTube 视频链接</label>
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setUrl(DEMO_URL);
              setValidationError("");
            }}
            disabled={active}
          >
            使用示例
          </button>
        </div>
        <div className={`input-shell${validationError ? " input-shell-error" : ""}`}>
          <LinkSimple aria-hidden="true" size={18} />
          <input
            id="video-url"
            type="url"
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (validationError) setValidationError("");
            }}
            placeholder="https://www.youtube.com/watch?v=..."
            disabled={active}
            aria-describedby={validationError ? "video-url-error" : "video-url-help"}
            aria-invalid={Boolean(validationError)}
          />
        </div>
        {validationError ? (
          <p id="video-url-error" className="field-error" role="alert">{validationError}</p>
        ) : (
          <p id="video-url-help" className="field-help">支持有字幕的公开视频；字幕不可用时会尝试视频解析。</p>
        )}
      </div>

      <div className="field-group requirement-field">
        <div className="field-heading">
          <label htmlFor="requirement">生成要求（可选）</label>
          <span>{requirement.length} / 1000</span>
        </div>
        <textarea
          id="requirement"
          value={requirement}
          onChange={(event) => setRequirement(event.target.value)}
          maxLength={1000}
          rows={6}
          disabled={active}
          placeholder="例如：面向没有技术背景的产品经理；保留关键数字；用克制、专业的访谈风格。"
        />
        <p className="constraint-help">可指定任务类型、输出风格、目标受众和内容约束。</p>
      </div>

      {active ? (
        <button className="primary-button cancel-button" type="button" onClick={onCancel}>
          <StopCircle aria-hidden="true" size={20} weight="fill" />
          停止生成
        </button>
      ) : (
        <button className="primary-button" type="submit">
          生成对话文章
          <ArrowRight className="button-tail" aria-hidden="true" size={18} />
        </button>
      )}
    </form>
  );
}
