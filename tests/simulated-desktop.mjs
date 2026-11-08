import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Nur für den Desktop-Abnahmetest. Es werden keine externen Anbieter kontaktiert.
export async function verifyHandoff(page, project, profile) {
  const key = randomUUID();
  const server = createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer " + key) {
      res.writeHead(401).end();
      return;
    }
    if (req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [{ id: "sim-a" }, { id: "sim-b" }] }));
      return;
    }
    let buf = "";
    for await (const part of req) buf += part;
    const body = JSON.parse(buf),
      input = body.messages.at(-1).content;
    let action = {
      kind: "plan",
      step: "probe",
      text: "bereit",
      path: "",
      old: "",
    };
    if (!input.startsWith("Funktionsprüfung")) {
      const ctx = JSON.parse(input);
      if (body.model === "sim-a" && ctx.aktionen.length) {
        res
          .writeHead(429, { "content-type": "application/json" })
          .end(
            JSON.stringify({
              error: {
                code: "insufficient_quota",
                message: "Simuliertes Kontingent erschöpft",
              },
            }),
          );
        return;
      }
      action =
        body.model === "sim-a"
          ? {
              ...action,
              kind: "write",
              step: "datei",
              text: "Übergabe geprüft.",
              path: "uebergabe.txt",
            }
          : {
              ...action,
              kind: "finish",
              step: "fertig",
              text: "Der gespeicherte Dateistand wurde übernommen.",
            };
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(
      "data: " +
        JSON.stringify({
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
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 18, completion_tokens: 9 },
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const base = "http://127.0.0.1:" + server.address().port + "/v1";
    const call = (op, args) =>
      page.evaluate(([op, args]) => window.relay.call(op, args), [op, args]);
    const chain = [];
    for (const id of ["sim-a", "sim-b"]) {
      const c = await call("connect", {
        type: "compatible",
        name: "Simuliert " + id,
        base,
        key,
        group: id,
      });
      const m = {
        connection: c.id,
        id,
        effort: "",
        inputPrice: 1,
        outputPrice: 2,
      };
      await call("probe", m);
      chain.push(m);
    }
    await call("settings", { chain, terminal: true, budget: 2 });
    await page
      .getByLabel("Neuer Auftrag", { exact: true })
      .fill("Schreibe die Übergabedatei.");
    await page
      .getByRole("button", { name: "Auftrag starten", exact: true })
      .click();
    await page
      .getByText("Der gespeicherte Dateistand wurde übernommen.", {
        exact: false,
      })
      .first()
      .waitFor();
    const state = await call("state", {});
    assert.equal(state.task.status, "fertig");
    assert.equal(state.task.model, "sim-b");
    assert.equal(state.actions.filter((a) => a.kind === "write").length, 1);
    assert.equal(
      fs.readFileSync(path.join(project, "uebergabe.txt"), "utf8"),
      "Übergabe geprüft.",
    );
    assert.ok(
      state.events.some(
        (e) => e.kind === "Modell" && e.body.includes("übernimmt"),
      ),
    );
    for (const filename of fs
      .readdirSync(profile)
      .filter((f) => f.startsWith("workspace.sqlite"))) {
      assert.ok(
        !fs
          .readFileSync(path.join(profile, filename))
          .includes(Buffer.from(key)),
        "Geheimnis im SQLite-Speicher",
      );
    }
  } finally {
    await new Promise((r) => server.close(r));
  }
}
