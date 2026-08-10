import type { ArticleSection } from "./contracts";

const SECOND_LEVEL_HEADING = /^##[ \t]+(.+?)\s*$/gm;

export function parseArticleSections(markdown: string): ArticleSection[] {
  const article = markdown.trim();
  if (!article) return [];

  const headings = [...article.matchAll(SECOND_LEVEL_HEADING)];
  if (headings.length === 0) {
    return [{ id: "chapter-1", title: "全文", markdown: article }];
  }

  return headings.map((heading, index) => {
    const start = heading.index ?? 0;
    const end = headings[index + 1]?.index ?? article.length;
    const title = heading[1].replace(/[ \t]+#+[ \t]*$/, "").trim();

    return {
      id: `chapter-${index + 1}`,
      title,
      markdown: article.slice(start, end).trim(),
    };
  });
}
