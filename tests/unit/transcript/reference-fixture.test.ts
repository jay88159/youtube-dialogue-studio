import { describe, expect, it } from "vitest";

import fixture from "../../../fixtures/xRh2sVcNXQ8.json";

describe("reference transcript fixture", () => {
  it("covers the complete reference video with original timed captions", () => {
    const last = fixture.segments.at(-1);

    expect(fixture.language).toBe("en");
    expect(fixture.segments.length).toBeGreaterThan(2_000);
    expect(last && last.startMs + last.durationMs).toBeGreaterThan(4_800_000);
    expect(fixture.sourceNote).toContain("YouTube 字幕轨道");
  });
});
