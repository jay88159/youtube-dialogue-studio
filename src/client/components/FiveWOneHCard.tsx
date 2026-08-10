import { WarningCircle } from "@phosphor-icons/react";

import type { FiveWOneH } from "@/shared/contracts";

const fields: Array<{ key: keyof FiveWOneH; label: string }> = [
  { key: "who", label: "Who / 谁" },
  { key: "what", label: "What / 什么" },
  { key: "when", label: "When / 何时" },
  { key: "where", label: "Where / 何地" },
  { key: "why", label: "Why / 为何" },
  { key: "how", label: "How / 如何" },
];

interface FiveWOneHCardProps {
  data?: FiveWOneH;
  error?: string;
  loading: boolean;
}

export function FiveWOneHCard({ data, error, loading }: FiveWOneHCardProps) {
  if (loading) {
    return (
      <div className="summary-card summary-loading" aria-label="正在生成 5W1H 总结">
        {fields.map((field) => (
          <div className="summary-field" key={field.key}>
            <span>{field.label}</span>
            <div className="skeleton-line" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="summary-card summary-error" role="alert">
        <WarningCircle aria-hidden="true" size={19} weight="fill" />
        <p>{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return (
    <dl className="summary-card">
      {fields.map((field) => (
        <div className="summary-field" key={field.key}>
          <dt>{field.label}</dt>
          <dd>{data[field.key]}</dd>
        </div>
      ))}
    </dl>
  );
}
