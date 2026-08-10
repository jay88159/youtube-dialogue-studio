// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SourceStatus } from "@/client/components/SourceStatus";

describe("SourceStatus", () => {
  it("labels Gemini video extraction without presenting it as original captions", () => {
    render(<SourceStatus phase="generating" source="gemini" segmentCount={12} />);

    expect(screen.getByText("AI 视频转录")).toBeInTheDocument();
    expect(screen.getByText(/不是 YouTube 原始字幕/)).toBeInTheDocument();
  });
});
