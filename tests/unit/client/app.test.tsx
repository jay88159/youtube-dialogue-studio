// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "@/client/App";
import { encodeNdjson } from "@/shared/ndjson";

const encoder = new TextEncoder();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("rejects an invalid URL before starting a request", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(<App />);

    fireEvent.change(screen.getByLabelText("YouTube 视频链接"), {
      target: { value: "https://example.com/video" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成对话文章" }));

    expect(screen.getByText("请输入有效的 YouTube 视频链接")).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("renders deltas before completion and requests 5W1H without article content", async () => {
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    const summary = {
      who: "Mark",
      what: "AI 收入与成本",
      when: "商业化早期",
      where: "消费者与企业市场",
      why: "AI 能直接创造价值",
      how: "订阅与按量计费",
    };
    const fetcher = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(stream, {
        headers: { "content-type": "application/x-ndjson" },
      }))
      .mockResolvedValueOnce(jsonResponse(summary));

    render(<App />);
    fireEvent.change(screen.getByLabelText("YouTube 视频链接"), {
      target: { value: "https://www.youtube.com/watch?v=xRh2sVcNXQ8" },
    });
    fireEvent.change(screen.getByLabelText("生成要求（可选）"), {
      target: { value: "面向产品经理，保持克制" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成对话文章" }));

    await act(async () => {
      streamController!.enqueue(encoder.encode(encodeNdjson({
        type: "generation.created",
        generationId: "955a4b5b-6add-4d23-8cba-bb6b4ec247ae",
      })));
      streamController!.enqueue(encoder.encode(encodeNdjson({
        type: "transcript.ready",
        source: "fixture",
        segmentCount: 30,
      })));
      streamController!.enqueue(encoder.encode(encodeNdjson({
        type: "article.delta",
        text: "# AI 革命的万亿美金之问\n\n## 智能经济\n\n**Mark：** 收入正在增长。",
      })));
    });

    expect(screen.getByText("收入正在增长。")).toBeInTheDocument();
    expect(screen.getByText("演示字幕")).toBeInTheDocument();
    expect(screen.getByText("文章生成中")).toBeInTheDocument();

    await act(async () => {
      streamController!.enqueue(encoder.encode(encodeNdjson({
        type: "article.delta",
        text: "\n\n## 成本曲线\n\n**主持人：** 单位成本如何下降？",
      })));
      streamController!.enqueue(encoder.encode(encodeNdjson({
        type: "article.completed",
        chapters: [
          { id: "chapter-1", title: "智能经济" },
          { id: "chapter-2", title: "成本曲线" },
        ],
      })));
      streamController!.close();
    });

    const summaryButtons = await screen.findAllByRole("button", { name: "生成 5W1H 总结" });
    fireEvent.click(summaryButtons[0]);

    await waitFor(() => expect(screen.getByText("AI 收入与成本")).toBeInTheDocument());
    expect(screen.getByText("Who / 谁")).toBeInTheDocument();
    expect(screen.getByText("How / 如何")).toBeInTheDocument();

    const [generationRequest, summaryRequest] = fetcher.mock.calls;
    expect(generationRequest[1]?.body).toBe(JSON.stringify({
      url: "https://www.youtube.com/watch?v=xRh2sVcNXQ8",
      requirement: "面向产品经理，保持克制",
    }));
    expect(summaryRequest[0]).toContain("/chapters/chapter-1/5w1h");
    expect(summaryRequest[1]?.body).toBeUndefined();
  });
});
