import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../desktop/store.mjs";
import { Actions } from "../desktop/actions.mjs";
import { Relay } from "../desktop/relay.mjs";
import { Fault, classify } from "../desktop/providers.mjs";
import { readText, safePath, restore } from "../desktop/files.mjs";
import { recoverCheckpoint } from "../desktop/checkpoint.mjs";

// Ausschließlich simulierte Anbieter für deterministische Fehlerszenarien.
function fixture(t, sequence, groups = ["A", "B", "C"]) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "relay-test-")),
    root = path.join(parent, "projekt");
  fs.mkdirSync(root);
  const db = path.join(parent, "test.sqlite"),
    store = new Store(db);
  store.project(root);
  const id = store.task(root, "Kleine Testanwendung erstellen.");
  const chain = groups.map((g, i) => ({
    id: "sim-" + i,
    connection: String(i),
    effort: "",
  }));
  store.set(
    "connections",
    groups.map((group, i) => ({
      id: String(i),
      type: "compatible",
      base: "https://example.invalid",
      group,
      verified: [JSON.stringify([chain[i].id, ""])],
    })),
  );
  store.configure(root, { chain, terminal: true });
  const actions = new Actions(store, async () => true);
  const seen = [],
    contexts = [],
    delays = [];
  const call = async (_c, _key, m, input) => {
    seen.push(m.id);
    contexts.push(JSON.parse(input));
    const v = sequence.shift();
    if (v instanceof Error) throw v;
    if (!v) throw Error("Keine weitere simulierte Antwort.");
    return { action: v, input: 20, output: 5 };
  };
  const engine = new Relay(store, actions, {
    key: () => "",
    call,
    delay: async (ms) => {
      delays.push(ms);
    },
  });
  t.after(() => {
    try {
      store.close();
    } catch {}
    fs.rmSync(parent, { recursive: true, force: true });
  });
  return {
    root,
    store,
    id,
    db,
    actions,
    engine,
    seen,
    contexts,
    delays,
    task: () => store.one("SELECT * FROM tasks WHERE id=?", id),
  };
}
const op = (kind, step, text = "", file = "", old = "") => ({
  kind,
  step,
  text,
  path: file,
  old,
});
const finish = () => op("finish", "fertig", "Build geprüft");
test("Kontingent erschöpft: Übergabe mit Projektstand und gemeinsamem Kontingent", async (t) => {
  const { engine, store, id, root, seen, contexts, task } = fixture(
    t,
    [
      op("write", "datei", "ok", "main.txt"),
      new Fault("quota", "leer"),
      finish(),
    ],
    ["eins", "eins", "zwei"],
  );
  await engine.run(id);
  assert.deepEqual(seen, ["sim-0", "sim-0", "sim-2"]);
  assert.equal(task().status, "fertig");
  assert.equal(readText(root, "main.txt"), "ok");
  assert.equal(contexts.at(-1).aktionen[0].status, "done");
  assert.match(contexts.at(-1).aktionen[0].result, /\+ok/);
  assert.ok(
    store.all("SELECT * FROM events WHERE kind='Übergabe'").length >= 2,
  );
});
test("Ratenlimit beachtet Retry-After und begrenzt Versuche", async (t) => {
  const fault = new Fault("rate", "warten", 1300);
  const h = fixture(t, [fault, fault, fault, finish()]);
  await h.engine.run(h.id);
  assert.deepEqual(h.delays, [1300, 2000]);
  assert.deepEqual(h.seen, ["sim-0", "sim-0", "sim-0", "sim-1"]);
});
test("Alle Modelle ausgeschöpft: gespeichert und pausiert", async (t) => {
  const h = fixture(
    t,
    [new Fault("quota", "A"), new Fault("quota", "B")],
    ["A", "B"],
  );
  await h.engine.run(h.id);
  assert.equal(h.task().status, "pausiert");
  await h.engine.run(h.id);
  assert.equal(h.seen.length, 2);
});
test("Inhaltsablehnung beendet die Staffel sofort", async (t) => {
  const h = fixture(t, [new Fault("refusal", "Sicherheit"), finish()]);
  await h.engine.run(h.id);
  assert.deepEqual(h.seen, ["sim-0"]);
  assert.equal(h.task().status, "pausiert");
});
test("Langfristiges Retry-After wird über die Sitzung hinaus berücksichtigt", async (t) => {
  const h = fixture(t, [new Fault("rate", "warten", 90000), finish()]);
  const now = Date.now();
  await h.engine.run(h.id);
  assert.equal(h.delays.length, 0);
  assert.ok(
    h.store.one("SELECT untilMs FROM cooldowns").untilMs >= now + 90000,
  );
});
test("Ungültige Zugangsdaten wechseln, Kontextfehler komprimiert zuerst", async (t) => {
  const h = fixture(t, [
    new Fault("auth", "falsch"),
    new Fault("context", "zu lang"),
    finish(),
  ]);
  await h.engine.run(h.id);
  assert.deepEqual(h.seen, ["sim-0", "sim-1", "sim-1"]);
});
test("Erledigte Schreibaktion und Terminalbefehl werden nicht doppelt ausgeführt", async (t) => {
  const cmd =
    process.platform === "win32"
      ? "echo einmal>>anzahl.txt"
      : "echo einmal >> anzahl.txt";
  const h = fixture(t, [
    op("write", "datei", "Original", "main.txt"),
    op("write", "datei", "Original", "main.txt"),
    op("run", "build", cmd),
    new Fault("quota", "leer"),
    op("run", "build-erneut", cmd),
    finish(),
  ]);
  await h.engine.run(h.id);
  assert.equal(h.task().status, "fertig");
  assert.equal(readText(h.root, "anzahl.txt").trim(), "einmal");
  assert.equal(h.store.one("SELECT count(*) AS n FROM actions").n, 3);
  const cp = h.store.one("SELECT files FROM checkpoints");
  fs.writeFileSync(path.join(h.root, "main.txt"), "Verändert");
  recoverCheckpoint(h.root, JSON.parse(cp.files), "main.txt");
  assert.equal(readText(h.root, "main.txt"), "Original");
});
test("Neustart prüft Datei, pausiert Aufgabe und sperrt unklare Befehle", async (t) => {
  const h = fixture(t, []);
  await h.actions.execute(
    h.task(),
    op("write", "datei", "geschrieben", "main.txt"),
    new AbortController().signal,
  );
  h.store.run("UPDATE actions SET status='pending'");
  h.store.status(h.id, "läuft");
  h.store.run(
    "INSERT INTO actions(id,task,step,kind,args,status,fingerprint) VALUES('cmd',?,'befehl','run','{}','running','abc')",
    h.id,
  );
  const reopened = new Store(h.db);
  try {
    new Actions(reopened, async () => true).recover();
    assert.equal(
      reopened.one("SELECT status FROM actions WHERE step='datei'").status,
      "done",
    );
    assert.equal(
      reopened.one("SELECT status FROM actions WHERE id='cmd'").status,
      "uncertain",
    );
    assert.equal(h.task().status, "pausiert");
    await h.engine.run(h.id);
    assert.equal(h.seen.length, 0);
  } finally {
    reopened.close();
  }
});
test("Unveränderte und fremd geänderte Dateien nach Absturz", async (t) => {
  const h = fixture(t, []),
    signal = new AbortController().signal;
  await h.actions.execute(h.task(), op("write", "a", "A", "a.txt"), signal);
  await h.actions.execute(h.task(), op("write", "b", "B", "b.txt"), signal);
  h.store.run("UPDATE actions SET status='pending'");
  fs.unlinkSync(path.join(h.root, "a.txt"));
  fs.writeFileSync(path.join(h.root, "b.txt"), "extern");
  h.actions.recover();
  assert.equal(
    h.store.one("SELECT status FROM actions WHERE step='a'").status,
    "failed",
  );
  assert.equal(
    h.store.one("SELECT status FROM actions WHERE step='b'").status,
    "uncertain",
  );
});
test("Projektgrenze, versteckte Zugangsdaten, Gerätepfade und Hardlinks", (t) => {
  const { root } = fixture(t, []);
  for (const file of [
    "../privat",
    "D:/outside",
    ".git/config",
    ".env.local",
    "a:stream",
    "NUL.txt",
    "foo.",
    "credentials.json",
  ])
    assert.throws(() => safePath(root, file));
  fs.writeFileSync(
    path.join(root, "source.txt"),
    ["sk-proj-", "a".repeat(30)].join(""),
  );
  assert.throws(() => readText(root, "source.txt"), /Zugangsdaten/);
  fs.linkSync(path.join(root, "source.txt"), path.join(root, "alias"));
  assert.throws(() => safePath(root, "alias"), /Verknüpfungen/);
});
test("Terminal benötigt Projektfreigabe und Bestätigung", async (t) => {
  const h = fixture(t, []),
    a = op("run", "test", "echo hallo");
  h.store.configure(h.root, { terminal: false });
  await assert.rejects(
    h.actions.execute(h.task(), a, new AbortController().signal),
    /deaktiviert/,
  );
  h.store.configure(h.root, { terminal: true });
  h.actions.confirm = async () => false;
  await assert.rejects(
    h.actions.execute(
      h.task(),
      { ...a, step: "2" },
      new AbortController().signal,
    ),
    /abgelehnt/,
  );
  assert.equal(h.actions.children.size, 0);
});
test("Wiederherstellung überschreibt keine späteren externen Änderungen", async (t) => {
  const h = fixture(t, []);
  fs.writeFileSync(path.join(h.root, "a.txt"), "lokal");
  await h.actions.execute(
    h.task(),
    op("edit", "x", "neu", "a.txt", "lokal"),
    new AbortController().signal,
  );
  const row = h.store.one("SELECT * FROM actions");
  restore(h.root, row);
  assert.equal(readText(h.root, "a.txt"), "lokal");
  assert.throws(() => restore(h.root, row), /weitere Änderungen/);
});
test("Unbekannter Preis und unzureichendes Budget stoppen vor API-Anfrage", async (t) => {
  const h = fixture(t, [finish()]);
  const cfg = h.store.config(h.root);
  cfg.budget = 0.01;
  h.store.configure(h.root, cfg);
  await h.engine.run(h.id);
  assert.equal(h.seen.length, 0);
  cfg.chain.forEach((m) => {
    m.inputPrice = 30;
    m.outputPrice = 100;
  });
  h.store.configure(h.root, cfg);
  await h.engine.run(h.id);
  assert.equal(h.seen.length, 0);
});
test("Fehlerkategorien berücksichtigen Kontingent, Ablehnung und ungültige Schlüssel", () => {
  assert.equal(classify(429, "insufficient_quota").kind, "quota");
  assert.equal(classify(429, "slow_down", "3").retryMs, 3000);
  assert.equal(classify(401, "invalid key").kind, "auth");
  assert.equal(classify(400, "content_filter").kind, "refusal");
  assert.equal(classify(503, "offline").kind, "temporary");
  assert.equal(classify(400, "context_length_exceeded").kind, "context");
});
