import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { generate, endpoint, events } from "../desktop/providers.mjs";
const action = {
  kind: "plan",
  step: "probe",
  path: "",
  text: "bereit",
  old: "",
};
async function local(t, frames) {
  const server = createServer((req, res) => {
    assert.equal(req.url, "/v1/chat/completions");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (const frame of frames)
      res.write("data: " + JSON.stringify(frame) + "\r\n\r\n");
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  return {
    type: "compatible",
    base: "http://127.0.0.1:" + server.address().port + "/v1",
  };
}
const chunk = {
  choices: [
    {
      delta: {
        tool_calls: [
          {
            index: 0,
            function: {
              name: "relay_action",
              arguments: JSON.stringify(action),
            },
          },
        ],
      },
    },
  ],
};
test("Vollständiger kompatibler HTTP-Stream mit Nutzungsdaten", async (t) => {
  const c = await local(t, [
    chunk,
    { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } },
  ]);
  const r = await generate(
    c,
    "",
    { id: "simuliert" },
    "Prüfung",
    new AbortController().signal,
  );
  assert.deepEqual(r.action, action);
  assert.equal(r.input, 10);
});
test("Vollständiges Argument ohne bestätigtes Stream-Ende wird verworfen", async (t) => {
  const c = await local(t, [chunk]);
  await assert.rejects(
    generate(c, "", { id: "simuliert" }, "Test", new AbortController().signal),
    /Unvollständige Antwort/,
  );
});
test("Inhaltsfilter und fehlerhafte Argumente führen zu keiner Aktion", async (t) => {
  const c = await local(t, [
    chunk,
    { choices: [{ delta: {}, finish_reason: "content_filter" }] },
  ]);
  await assert.rejects(
    generate(c, "", { id: "simuliert" }, "Test", new AbortController().signal),
    (e) => e.kind === "refusal",
  );
});
test("Unvollständiges SSE-Fragment wird nicht übernommen", async () => {
  async function* broken() {
    yield Buffer.from('data: {"partial":');
  }
  await assert.rejects(async () => {
    for await (const _ of events(broken())) {
    }
  }, /Unvollständiges Stream-Ende/);
});
test("Schlüssel nur an sicheren Endpunkt, feste offizielle Anbieterziele", () => {
  assert.throws(() => endpoint("compatible", "http://example.org/v1"));
  assert.throws(() => endpoint("compatible", "https://user:pass@example.org"));
  assert.equal(
    endpoint("openai", "https://example.org"),
    "https://api.openai.com/v1",
  );
});
