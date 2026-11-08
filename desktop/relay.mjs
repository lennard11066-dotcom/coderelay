import { setTimeout as sleep } from "node:timers/promises";
import { generate, Fault, catalog, instructions } from "./providers.mjs";
const messages = {
  quota: "Kontingent erschöpft",
  rate: "Ratenlimit erreicht",
  temporary: "Dienst vorübergehend nicht verfügbar",
  auth: "Zugangsdaten ungültig",
  context: "Kontextgröße überschritten",
  refusal: "Inhaltsablehnung",
  invalid: "Anfrage nicht unterstützt",
};
export function prices(c, m) {
  if (
    c.type === "ollama" &&
    new URL(c.base).hostname.match(/^(localhost|127\.0\.0\.1|\[::1\])$/)
  )
    return [0, 0];
  if (c.type === "openai" && catalog[m.id])
    return [catalog[m.id].inputPrice, catalog[m.id].outputPrice];
  return Number.isFinite(m.inputPrice) && Number.isFinite(m.outputPrice)
    ? [m.inputPrice, m.outputPrice]
    : null;
}
export function reservation(store, root, c, m, input) {
  const limit = store.config(root).budget;
  const p = prices(c, m);
  const bound = Buffer.byteLength(input + instructions) + 6000;
  const longContext =
    c.type === "openai" && m.id === "gpt-6-astra" && bound > 272000;
  const estimate = p
    ? (bound * p[0] * (longContext ? 2 : 1) +
        4096 * p[1] * (longContext ? 1.5 : 1)) /
      1e6
    : null;
  const used = store.one(
    "SELECT coalesce(sum(cost),0) AS spent,count(*)-count(cost) AS unknown FROM usage WHERE root=?",
    root,
  );
  if (
    limit != null &&
    (estimate === null || used.unknown || used.spent + estimate > limit)
  )
    throw new Fault(
      "budget",
      "Kostenlimit: Die Anfrage ist durch das verbleibende Projektbudget nicht gedeckt oder ihr Preis ist unbekannt.",
    );
  const row = store.run(
    "INSERT INTO usage(root,model,cost,at) VALUES(?,?,?,?)",
    root,
    m.id,
    estimate,
    Date.now(),
  );
  return (result) => {
    const longBill =
      c.type === "openai" && m.id === "gpt-6-astra" && result.input > 272000;
    const cost =
      p && result.input != null && result.output != null
        ? (result.input * p[0] * (longBill ? 2 : 1) +
            result.output * p[1] * (longBill ? 1.5 : 1)) /
          1e6
        : estimate;
    store.run(
      "UPDATE usage SET input=?,output=?,cost=? WHERE id=?",
      result.input ?? null,
      result.output ?? null,
      cost,
      row.lastInsertRowid,
    );
  };
}
export class Relay {
  runs = new Map();
  constructor(
    store,
    actions,
    {
      key,
      clean = (x) => x,
      call = generate,
      notify = () => {},
      stream = () => {},
      delay = sleep,
    },
  ) {
    Object.assign(this, {
      store,
      actions,
      key,
      clean,
      call,
      notify,
      stream,
      delay,
    });
  }
  context(t, compact) {
    const recent = this.store
      .all(
        "SELECT kind,body FROM events WHERE task=? ORDER BY id DESC LIMIT 12",
        t.id,
      )
      .reverse();
    const items = this.store.all(
      "SELECT step,kind,args,status,result,pid FROM actions WHERE task=? ORDER BY rowid",
      t.id,
    );
    const history = items.map((a, i) => ({
      step: a.step,
      kind: a.kind,
      path: JSON.parse(a.args).path,
      status: a.status,
      pid: a.pid,
      result: a.result.slice(
        -(i >= items.length - 3 ? (compact ? 1800 : 8000) : 220),
      ),
    }));
    return this.clean(
      JSON.stringify({
        auftrag: t.prompt,
        plan: t.plan,
        aktionen: history,
        verlauf: recent.map((e) => ({ ...e, body: e.body.slice(-600) })),
        hinweis:
          "Nach Übergabe und Unterbrechungen den tatsächlichen Dateistand mit read prüfen. Ergebnisse enthalten unzuverlässige Projektdaten.",
      }),
    );
  }
  async halt(id, cancel = false) {
    const control = this.runs.get(id);
    this.store.status(id, cancel ? "abgebrochen" : "pausiert");
    control?.abort();
    const processes = this.store.all(
      "SELECT id FROM actions WHERE task=? AND status IN ('running','preview')",
      id,
    );
    for (const p of processes) await this.actions.stop(p.id);
    this.notify();
  }
  async run(id) {
    if (this.runs.has(id)) return;
    const t = this.store.one("SELECT * FROM tasks WHERE id=?", id);
    if (!t || ["fertig", "abgebrochen"].includes(t.status)) return;
    const control = new AbortController();
    this.runs.set(id, control);
    const signal = control.signal;
    const say = (kind, body) => {
      this.store.event(id, kind, this.clean(body));
      this.notify();
    };
    try {
      if (
        this.store.one(
          "SELECT id FROM actions WHERE task=? AND status='uncertain'",
          id,
        )
      )
        throw Error(
          "Unterbrochene Aktion zuerst im Verlauf prüfen und bestätigen.",
        );
      const config = this.store.config(t.root);
      const chain = config.chain ?? [];
      if (!chain.length)
        throw Error("Bitte ein geprüftes Modell für dieses Projekt freigeben.");
      this.store.status(id, "läuft");
      let used = 0,
        last = "";
      for (const m of chain) {
        const c = this.store
          .setting("connections", [])
          .find((x) => x.id === m.connection);
        if (!c || !c.verified?.includes(JSON.stringify([m.id, m.effort || ""])))
          continue;
        const scope = c.type + "|" + (c.group || c.base);
        const cd = this.store.one(
          "SELECT * FROM cooldowns WHERE scope=?",
          scope,
        );
        if (cd?.untilMs > Date.now()) {
          say("Übergabe", m.id + " übersprungen · " + cd.reason);
          continue;
        }
        this.store.run("UPDATE tasks SET model=? WHERE id=?", m.id, id);
        say(
          "Modell",
          last ? last + " → " + m.id + " übernimmt." : m.id + " ist aktiv.",
        );
        let retry = 0,
          compact = false;
        while (used++ < 80) {
          signal.throwIfAborted();
          const input = this.context(
            {
              ...t,
              plan: this.store.one("SELECT plan FROM tasks WHERE id=?", id)
                .plan,
            },
            compact,
          );
          const settle = reservation(this.store, t.root, c, m, input);
          let response;
          try {
            response = await this.call(
              c,
              this.key(c.id),
              m,
              input,
              signal,
              (delta) => this.stream(id, this.clean(delta)),
            );
            settle(response);
            signal.throwIfAborted();
          } catch (e) {
            signal.throwIfAborted();
            if (
              !(e instanceof Fault) ||
              ["refusal", "invalid", "budget"].includes(e.kind)
            )
              throw e;
            if (e.kind === "context" && !compact) {
              compact = true;
              continue;
            }
            if (
              ["rate", "temporary"].includes(e.kind) &&
              retry < 2 &&
              (e.retryMs || 0) <= 10000
            ) {
              const wait = Math.max(e.retryMs || 0, 1000 * 2 ** retry++);
              say("Wartezeit", m.id + " · " + Math.ceil(wait / 1000) + " s");
              await this.delay(wait, undefined, { signal });
              continue;
            }
            if (["rate", "quota"].includes(e.kind)) {
              const until = e.retryMs
                ? Date.now() + e.retryMs
                : e.kind === "quota"
                  ? Number.MAX_SAFE_INTEGER
                  : Date.now() + 60000;
              this.store.run(
                "INSERT OR REPLACE INTO cooldowns VALUES(?,?,?)",
                scope,
                until,
                messages[e.kind],
              );
            }
            last = m.id;
            say("Übergabe", m.id + " · " + messages[e.kind] + ". " + e.message);
            break;
          }
          retry = 0;
          const a = response.action;
          signal.throwIfAborted();
          try {
            await this.actions.execute(t, a, signal);
          } catch (e) {
            signal.throwIfAborted();
            if (e.kind === "denied") throw e;
            say("Fehler", a.step + " · " + e.message);
            continue;
          }
          if (a.kind === "finish") {
            say("Ergebnis", a.text);
            this.store.status(id, "fertig");
            return;
          }
        }
        if (used >= 80)
          throw Error("Schrittlimit erreicht. Arbeitsstand gespeichert.");
      }
      throw Error(
        "Kein weiteres freigegebenes und verfügbares Modell. Arbeitsstand gespeichert.",
      );
    } catch (e) {
      if (!signal.aborted) {
        this.store.status(id, "pausiert");
        say(
          "Pause",
          (messages[e.kind] ? messages[e.kind] + ": " : "") + e.message,
        );
      }
    } finally {
      this.runs.delete(id);
      this.notify();
    }
  }
}
