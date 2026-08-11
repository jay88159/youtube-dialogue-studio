const baseUrl = process.env.BASE_URL ?? "https://youtube-dialogue-studio.delightful-lock.workers.dev";
const videoUrl = process.env.VIDEO_URL ?? "https://www.youtube.com/watch?v=xRh2sVcNXQ8";
const requirement = process.env.REQUIREMENT ??
  "面向零基础创业者，用清晰比喻解释商业判断；不要使用技术行话；每章末尾给出一句行动提示";

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readNdjson(response, startedAt) {
  invariant(response.ok, `generation failed with HTTP ${response.status}`);
  invariant(response.body, "generation response has no body");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  const events = [];
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.trim()) {
        events.push({ elapsedMs: Date.now() - startedAt, event: JSON.parse(line) });
      }
    }

    if (done) break;
  }

  if (buffer.trim()) {
    events.push({ elapsedMs: Date.now() - startedAt, event: JSON.parse(buffer) });
  }

  return events;
}

const startedAt = Date.now();
const generationResponse = await fetch(`${baseUrl}/api/generations`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ url: videoUrl, requirement }),
  signal: AbortSignal.timeout(90_000),
});
const events = await readNdjson(generationResponse, startedAt);

const created = events.find(({ event }) => event.type === "generation.created");
const transcript = events.find(({ event }) => event.type === "transcript.ready");
const deltas = events.filter(({ event }) => event.type === "article.delta");
const completed = events.find(({ event }) => event.type === "article.completed");
const failed = events.find(({ event }) => event.type === "generation.failed");

invariant(created, "generation.created event is missing");
invariant(transcript, "transcript.ready event is missing");
invariant(!failed, `generation failed: ${failed?.event.error?.code ?? "unknown"} ${failed?.event.error?.message ?? ""}`);
invariant(deltas.length > 1, "article did not arrive in multiple deltas");
invariant(completed, "article.completed event is missing");
invariant(deltas[0].elapsedMs < completed.elapsedMs, "first delta did not precede completion");
invariant(completed.event.chapters?.length >= 2, "article has fewer than two chapters");

const article = deltas.map(({ event }) => event.text).join("");
const h1Headings = [...article.matchAll(/^# (?!#)/gm)].length;
const speakers = [...article.matchAll(/\*\*([^*：:]{1,30})[：:]\*\*|\*\*([^*]{1,30})\*\*[：:]/g)]
  .map((match) => match[1] ?? match[2]);
invariant(h1Headings === 1, `article contains ${h1Headings} first-level headings`);

const chapter = completed.event.chapters[0];
const summaryResponse = await fetch(
  `${baseUrl}/api/generations/${created.event.generationId}/chapters/${chapter.id}/5w1h`,
  { method: "POST", signal: AbortSignal.timeout(60_000) },
);
invariant(summaryResponse.ok, `5W1H failed with HTTP ${summaryResponse.status}`);

const summary = await summaryResponse.json();
const expectedKeys = ["how", "what", "when", "where", "who", "why"];
invariant(
  JSON.stringify(Object.keys(summary).sort()) === JSON.stringify(expectedKeys),
  "5W1H does not contain the fixed six-field contract",
);
invariant(Object.values(summary).every((value) => typeof value === "string" && value.trim()), "5W1H contains an empty field");

console.log(
  JSON.stringify(
    {
      baseUrl,
      transcriptSource: transcript.event.source,
      transcriptSegments: transcript.event.segmentCount,
      transcriptReadyMs: transcript.elapsedMs,
      firstDeltaMs: deltas[0].elapsedMs,
      transcriptToFirstDeltaMs: deltas[0].elapsedMs - transcript.elapsedMs,
      completedMs: completed.elapsedMs,
      deltaEvents: deltas.length,
      articleCharacters: article.length,
      chapters: completed.event.chapters.length,
      chapterTitles: completed.event.chapters.map((item) => item.title),
      speakers: [...new Set(speakers)],
      summaryFields: Object.keys(summary).length,
      summaryWhen: summary.when,
    },
    null,
    2,
  ),
);
