import { describe, expect, it } from "vitest";

import { parseArticleSections } from "@/shared/article-sections";

describe("parseArticleSections", () => {
  it("splits second-level headings into stable chapter IDs", () => {
    const markdown = [
      "# 对话安德森：AI 革命的万亿美金之问",
      "",
      "开场说明。",
      "",
      "## 智能经济：收入爆发与成本下降",
      "",
      "**Mark：** AI 正在形成新的收入曲线。",
      "",
      "## 基础设施：供给如何追上需求",
      "",
      "**主持人：** 数据中心会先遇到什么约束？",
    ].join("\n");

    expect(parseArticleSections(markdown)).toEqual([
      {
        id: "chapter-1",
        title: "智能经济：收入爆发与成本下降",
        markdown: "## 智能经济：收入爆发与成本下降\n\n**Mark：** AI 正在形成新的收入曲线。",
      },
      {
        id: "chapter-2",
        title: "基础设施：供给如何追上需求",
        markdown: "## 基础设施：供给如何追上需求\n\n**主持人：** 数据中心会先遇到什么约束？",
      },
    ]);
  });

  it("uses the full article when the model omits second-level headings", () => {
    expect(parseArticleSections("# 标题\n\n只有一段正文。"))
      .toEqual([
        {
          id: "chapter-1",
          title: "全文",
          markdown: "# 标题\n\n只有一段正文。",
        },
      ]);
  });

  it("returns no chapters for blank output", () => {
    expect(parseArticleSections("  \n")).toEqual([]);
  });
});
