const baseUrl = process.env.BASE_URL ?? "https://youtube-dialogue-studio.delightful-lock.workers.dev";
const videoUrl = "https://www.youtube.com/watch?v=xRh2sVcNXQ8";
const requirement =
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

invariant(created, "generation.created event is missing");
invariant(transcript, "transcript.ready event is missing");
invariant(deltas.length > 1, "article did not arrive in multiple deltas");
invariant(completed, "article.completed event is missing");
invariant(deltas[0].elapsedMs < completed.elapsedMs, "first delta did not precede completion");
invariant(completed.event.chapters?.length >= 2, "article has fewer than two chapters");

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
      firstDeltaMs: deltas[0].elapsedMs,
      completedMs: completed.elapsedMs,
      deltaEvents: deltas.length,
      chapters: completed.event.chapters.length,
      summaryFields: Object.keys(summary).length,
    },
    null,
    2,
  ),
);
