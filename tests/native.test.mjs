import test from "node:test";
import assert from "node:assert/strict";
import { generate, models } from "../desktop/providers.mjs";

const action = {
  step: "probe",
  kind: "plan",
  path: "",
  text: "bereit",
  old: "",
};
const native = {
  openai: {
    path: "/responses",
    frames: [
      {
        type: "response.completed",
        response: {
          output: [
            {
              type: "function_call",
              name: "relay_action",
              arguments: JSON.stringify(action),
            },
          ],
          usage: { input_tokens: 7, output_tokens: 3 },
        },
      },
    ],
    list: { data: [{ id: "simuliert" }] },
  },
  anthropic: {
    path: "/messages",
    frames: [
      { type: "message_start", message: { usage: { input_tokens: 7 } } },
      {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "relay_action" },
      },
      {
        type: "content_block_delta",
        delta: { partial_json: JSON.stringify(action) },
      },
      {
        type: "message_delta",
        delta: { stop_reason: "tool_use" },
        usage: { output_tokens: 3 },
      },
      { type: "message_stop" },
    ],
    list: { data: [{ id: "simuliert", display_name: "Testmodell" }] },
  },
  gemini: {
    path: ":streamGenerateContent?alt=sse",
    frames: [
      {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: "relay_action", args: action } }],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 },
      },
    ],
    list: {
      models: [
        {
          name: "models/simuliert",
          displayName: "Testmodell",
          supportedGenerationMethods: ["generateContent"],
        },
      ],
    },
  },
};
for (const [type, fixture] of Object.entries(native))
  test(
    type + " · simulierte Modellliste und nativer Werkzeugstream",
    async (t) => {
      const connection = { type, base: "https://example.invalid" };
      t.mock.method(globalThis, "fetch", async (url, req) => {
        assert.ok(!url.includes("example.invalid"));
        assert.equal(req.redirect, "error");
        if (req.method === "GET") return Response.json(fixture.list);
        assert.ok(url.endsWith(fixture.path));
        assert.ok(JSON.parse(req.body).tools.length);
        return new Response(
          fixture.frames
            .map((x) => "data: " + JSON.stringify(x) + "\n\n")
            .join(""),
        );
      });
      const available = await models(connection, "test");
      assert.equal(available[0].id, "simuliert");
      const r = await generate(
        connection,
        "test",
        { id: "simuliert" },
        "Probe",
        new AbortController().signal,
      );
      assert.deepEqual(r.action, action);
      assert.equal(r.input, 7);
      assert.equal(r.output, 3);
    },
  );
