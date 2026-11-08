import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  readText,
  list,
  safePath,
  write,
  diff,
  digest,
  secretPattern,
} from "./files.mjs";
import { checkpoint } from "./checkpoint.mjs";
const exec = promisify(execFile);
export function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
export function childEnv() {
  const allowed =
    /^(?:path|pathext|systemroot|windir|comspec|temp|tmp|home|userprofile|localappdata|appdata|programfiles(?:\(x86\))?|java_home|systemdrive|username|lang|number_of_processors|processor_architecture)$/i;
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => allowed.test(key)),
  );
}
export class Actions {
  children = new Map();
  constructor(store, confirm, clean = (s) => s, notify = () => {}) {
    Object.assign(this, { store, confirm, clean, notify });
  }
  async manualSave(task, file, before, after) {
    if (
      secretPattern.test(after) ||
      this.clean(after) !== after ||
      this.clean(before ?? "") !== (before ?? "")
    )
      throw Error("Datei enthält Zugangsdaten.");
    const id = randomUUID(),
      args = JSON.stringify({ path: file });
    this.store.run(
      "INSERT INTO actions(id,task,step,kind,args,status,beforeText,afterText,fingerprint) VALUES(?,?,?,?,?,'pending',?,?,?)",
      id,
      task.id,
      id,
      "write",
      args,
      before,
      after,
      digest(args + after),
    );
    try {
      write(task.root, file, before, after);
      this.store.run(
        "UPDATE actions SET status='done',result=? WHERE id=?",
        diff(file, before, after),
        id,
      );
    } catch (e) {
      this.store.run(
        "UPDATE actions SET status='failed',result=? WHERE id=?",
        e.message,
        id,
      );
      throw e;
    }
  }
  async stop(id) {
    const child = this.children.get(id);
    if (!child?.pid) return;
    if (process.platform === "win32") {
      await exec("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        windowsHide: true,
      }).catch(() => {});
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
    }
    if (alive(child.pid))
      throw Error("Prozess " + child.pid + " läuft möglicherweise weiter.");
  }
  recover() {
    this.store.run("UPDATE tasks SET status='pausiert' WHERE status='läuft'");
    for (const a of this.store.all(
      "SELECT actions.*,root FROM actions JOIN tasks ON tasks.id=actions.task WHERE actions.status IN ('pending','running','preview')",
    )) {
      let state = "uncertain",
        result = "Unterbrochen. Tatsächlichen Projektzustand prüfen.";
      if (a.kind === "write") {
        try {
          const p = JSON.parse(a.args).path;
          const actual = fs.existsSync(safePath(a.root, p))
            ? readText(a.root, p)
            : null;
          if (actual === a.afterText) {
            state = "done";
            result = "Gespeicherter Dateiinhalt bestätigt.";
          } else if (actual === a.beforeText) {
            state = "failed";
            result = "Datei unverändert. Neuer Arbeitsschritt möglich.";
          }
        } catch {}
      } else if (a.kind === "run" || a.kind === "preview") {
        result = alive(a.pid)
          ? "PID " +
            a.pid +
            " ist belegt. Prozess und Auswirkungen manuell prüfen."
          : "Kein zugehöriger laufender Prozess gefunden. Auswirkungen prüfen.";
      } else {
        state = "failed";
      }
      this.store.run(
        "UPDATE actions SET status=?,result=? WHERE id=?",
        state,
        result,
        a.id,
      );
      this.store.event(a.task, "Wiederherstellung", a.step + " · " + result);
    }
  }
  async execute(task, a, signal) {
    signal.throwIfAborted();
    const { id: tid, root } = task;
    const fingerprint = digest(JSON.stringify([a.kind, a.path, a.text, a.old]));
    const prior = this.store.one(
      "SELECT * FROM actions WHERE task=? AND step=?",
      tid,
      a.step,
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw Error("Schritt-ID wurde mit anderen Argumenten wiederverwendet.");
      return prior.result;
    }
    if (
      Object.values(a).some(
        (v) =>
          typeof v === "string" &&
          (secretPattern.test(v) || this.clean(v) !== v),
      )
    )
      throw Error("Werkzeugaufruf enthält Zugangsdaten.");
    const id = randomUUID();
    let before = null,
      after = null,
      kind = a.kind;
    if (kind === "write" || kind === "edit") {
      const exists = fs.existsSync(safePath(root, a.path));
      before = exists ? readText(root, a.path) : null;
      const previous = this.store.one(
        "SELECT afterText,result FROM actions WHERE task=? AND fingerprint=? AND status='done' ORDER BY rowid DESC LIMIT 1",
        tid,
        fingerprint,
      );
      if (previous && previous.afterText === before) return previous.result;
      if (kind === "edit") {
        if (
          before === null ||
          !a.old ||
          before.indexOf(a.old) < 0 ||
          before.indexOf(a.old) !== before.lastIndexOf(a.old)
        )
          throw Error("Suchtext muss in der Datei exakt einmal vorkommen.");
        after = before.replace(a.old, () => a.text);
      } else {
        if (before !== null && before !== a.text)
          throw Error("Vorhandene Dateien mit edit gezielt bearbeiten.");
        after = a.text;
      }
      if (
        this.clean(before ?? "") !== (before ?? "") ||
        this.clean(after) !== after
      )
        throw Error("Datei enthält geschützte Zugangsdaten.");
      kind = "write";
    }
    if (["run", "preview"].includes(kind)) {
      const repeated = this.store.one(
        "SELECT id,result,status FROM actions WHERE task=? AND fingerprint=? AND status IN ('done','preview','uncertain','running') ORDER BY rowid DESC LIMIT 1",
        tid,
        fingerprint,
      );
      if (repeated) {
        const changed = this.store.one(
          "SELECT 1 AS ok FROM actions WHERE task=? AND kind='write' AND status='done' AND rowid>(SELECT rowid FROM actions WHERE id=?)",
          tid,
          repeated.id,
        );
        if (!changed || repeated.status !== "done")
          return "Bereits registriert: " + repeated.result;
      }
    }
    this.store.run(
      "INSERT INTO actions(id,task,step,kind,args,status,beforeText,afterText,fingerprint) VALUES(?,?,?,?,?,?,?,?,?)",
      id,
      tid,
      a.step,
      kind,
      JSON.stringify(a),
      "pending",
      before,
      after,
      fingerprint,
    );
    let result = "";
    try {
      if (kind === "list") result = JSON.stringify(list(root, a.path));
      if (kind === "read") result = readText(root, a.path);
      if (kind === "write") {
        if (
          before !== null &&
          a.old &&
          a.old !== a.text &&
          !a.text.includes(a.old) &&
          !(await this.confirm(
            "Bestehenden Inhalt ersetzen?",
            diff(a.path, before, after).slice(0, 7000),
          ))
        )
          throw Object.assign(Error("Änderung abgelehnt."), { kind: "denied" });
        signal.throwIfAborted();
        write(root, a.path, before, after);
        result = diff(a.path, before, after);
      }
      if (kind === "plan") {
        this.store.run("UPDATE tasks SET plan=? WHERE id=?", a.text, tid);
        result = a.text;
      }
      if (kind === "finish") result = a.text;
      if (kind === "run" || kind === "preview") {
        if (!this.store.config(root).terminal)
          throw Object.assign(
            Error(
              "Terminalzugriff ist in den Projektberechtigungen deaktiviert.",
            ),
            { kind: "denied" },
          );
        const ok = await this.confirm(
          "Terminalbefehl freigeben",
          root +
            "\n\n" +
            a.text +
            "\n\nDer Prozess läuft mit Ihren Windows-Rechten, einschließlich Zugriff auf Dateien und Netzwerk.",
        );
        if (!ok)
          throw Object.assign(Error("Befehl abgelehnt."), { kind: "denied" });
        signal.throwIfAborted();
        this.store.run(
          "INSERT INTO checkpoints VALUES(?,?)",
          id,
          JSON.stringify(checkpoint(root, this.clean)),
        );
        result = await this.command(
          task,
          id,
          a.text,
          kind === "preview",
          signal,
        );
      }
      if (kind !== "preview" || !this.children.has(id))
        this.store.run(
          "UPDATE actions SET status='done',result=? WHERE id=?",
          this.clean(result).slice(-64000),
          id,
        );
      this.notify();
      return this.clean(result);
    } catch (e) {
      this.store.run(
        "UPDATE actions SET status=?,result=? WHERE id=?",
        ["run", "preview"].includes(kind) && signal.aborted
          ? "uncertain"
          : "failed",
        this.clean(e.message),
        id,
      );
      throw e;
    }
  }
  async command(task, id, command, preview, signal) {
    const win = process.platform === "win32";
    const child = spawn(
      win ? process.env.ComSpec || "cmd.exe" : "/bin/sh",
      win ? ["/d", "/s", "/c", '"' + command + '"'] : ["-c", command],
      {
        cwd: task.root,
        env: childEnv(),
        windowsHide: true,
        detached: !win,
        windowsVerbatimArguments: win,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.children.set(id, child);
    this.store.run(
      "UPDATE actions SET pid=?,status=? WHERE id=?",
      child.pid ?? null,
      preview ? "preview" : "running",
      id,
    );
    this.notify();
    let output = "";
    const record = (chunk) => {
      output = (output + chunk.toString()).slice(-64000);
    };
    child.stdout.on("data", record);
    child.stderr.on("data", record);
    let last = "";
    const refresh = setInterval(() => {
      if (output !== last) {
        last = output;
        this.store.run(
          "UPDATE actions SET result=? WHERE id=?",
          this.clean(output),
          id,
        );
        this.notify();
      }
    }, 350);
    const abort = () => {
      void this.stop(id).catch((e) =>
        this.store.event(task.id, "Prozess", e.message),
      );
    };
    signal.addEventListener("abort", abort, { once: true });
    const end = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => resolve("Exit " + code + "\n" + output));
    }).finally(() => {
      clearInterval(refresh);
      signal.removeEventListener("abort", abort);
      this.children.delete(id);
    });
    if (preview) {
      void end.then(
        (result) => {
          this.store.run(
            "UPDATE actions SET status='done',result=? WHERE id=?",
            this.clean(result),
            id,
          );
          this.notify();
        },
        (e) => {
          this.store.run(
            "UPDATE actions SET status='failed',result=? WHERE id=?",
            this.clean(e.message),
            id,
          );
          this.notify();
        },
      );
      return "Vorschau gestartet, PID " + child.pid;
    }
    const timeout = setTimeout(abort, 15 * 60 * 1000);
    try {
      return await end;
    } finally {
      clearTimeout(timeout);
    }
  }
}
