import { expect, test } from "@playwright/test";

import type { GenerationEvent } from "../../src/shared/contracts";
import { encodeNdjson } from "../../src/shared/ndjson";

const generationId = "955a4b5b-6add-4d23-8cba-bb6b4ec247ae";
const events: GenerationEvent[] = [
  { type: "generation.created", generationId },
  { type: "transcript.ready", source: "fixture", segmentCount: 30 },
  {
    type: "article.delta",
    text: "# 对话安德森：AI 革命的万亿美金之问\n\n这是一场关于 AI 商业化速度、收入与成本的深度对话。\n\n## 智能经济：收入爆发与成本塌陷\n\n**主持人：** 为什么这一轮 AI 商业化与过去不同？\n\n**Mark：** AI 可以沿用互联网已有的分发渠道，快速抵达全球用户。消费者订阅与企业按量付费正在同时形成。",
  },
  {
    type: "article.delta",
    text: "\n\n## 从基础设施到应用价值\n\n**主持人：** 成本下降会带来什么？\n\n**Mark：** GPU 与数据中心供给改善后，单位 token 成本继续下降，反而会释放更多需求。真正重要的是把模型能力转化为个人效率与企业收入。",
  },
  {
    type: "article.completed",
    chapters: [
      { id: "chapter-1", title: "智能经济：收入爆发与成本塌陷" },
      { id: "chapter-2", title: "从基础设施到应用价值" },
    ],
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/generations", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson; charset=utf-8",
      body: events.map((event) => encodeNdjson(event)).join(""),
    });
  });
  await page.route("**/api/generations/*/chapters/*/5w1h", async (route) => {
    expect(route.request().postData()).toBeNull();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        who: "Mark 与主持人",
        what: "AI 行业的收入、商业模式与单位成本趋势",
        when: "当前商业化早期以及未来十年",
        where: "消费者、企业、云服务与数据中心市场",
        why: "AI 可快速分发并直接创造效率与收入价值",
        how: "通过订阅、按量计费与持续下降的单位成本扩大需求",
      }),
    });
  });
});

test("generates an article and opens a chapter summary", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "把视频整理成可读的对话" })).toBeVisible();
  await page.getByRole("button", { name: "使用示例" }).click();
  await page.getByLabel("生成要求（可选）").fill("面向产品经理，保留商业数据，风格克制专业");
  await page.getByRole("button", { name: "生成对话文章" }).click();

  await expect(page.getByRole("heading", { name: "对话安德森：AI 革命的万亿美金之问" })).toBeVisible();
  await expect(page.getByText("演示字幕")).toBeVisible();
  await page.getByRole("button", { name: "生成 5W1H 总结" }).first().click();

  await expect(page.getByText("Who / 谁")).toBeVisible();
  await expect(page.getByText("AI 行业的收入、商业模式与单位成本趋势")).toBeVisible();

  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(pageWidth.scrollWidth).toBeLessThanOrEqual(pageWidth.clientWidth);
});

test("renders delayed production chunks and keeps the latest text visible", async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    const encoder = new TextEncoder();
    const line = (event: unknown) => encoder.encode(`${JSON.stringify(event)}\n`);

    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith("/api/generations")) return originalFetch(input, init);

      return new Response(new ReadableStream({
        async start(controller) {
          controller.enqueue(line({
            type: "generation.created",
            generationId: "955a4b5b-6add-4d23-8cba-bb6b4ec247ae",
          }));
          controller.enqueue(line({ type: "transcript.ready", source: "fixture", segmentCount: 2801 }));
          await new Promise((resolve) => setTimeout(resolve, 100));
          controller.enqueue(line({
            type: "article.delta",
            text: `# 长篇访谈\n\n## 第一章\n\n${"**Mark：** 第一批实时正文。\n\n".repeat(80)}`,
          }));
          await new Promise((resolve) => setTimeout(resolve, 600));
          controller.enqueue(line({
            type: "article.delta",
            text: "## 第二章\n\n**Jen：** 第二批正文随后到达。",
          }));
          await new Promise((resolve) => setTimeout(resolve, 600));
          controller.enqueue(line({
            type: "article.completed",
            chapters: [
              { id: "chapter-1", title: "第一章" },
              { id: "chapter-2", title: "第二章" },
            ],
          }));
          controller.close();
        },
      }), { headers: { "content-type": "application/x-ndjson" } });
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "使用示例" }).click();
  await page.getByRole("button", { name: "生成对话文章" }).click();

  await expect(page.locator(".streaming-markdown")).toContainText("第一批实时正文。");
  await expect(page.locator(".streaming-markdown")).not.toContainText("第二批正文随后到达。");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect(page.getByText("第二批正文随后到达。")).toBeVisible();
  await expect(page.locator(".reader-state")).toHaveText("阅读模式");
});

test("shows inline validation for a non-YouTube URL", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("YouTube 视频链接").fill("https://example.com/video");
  await page.getByRole("button", { name: "生成对话文章" }).click();
  await expect(page.getByRole("alert")).toHaveText("请输入有效的 YouTube 视频链接");
});
