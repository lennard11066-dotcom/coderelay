import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  session,
  protocol,
  net,
  Menu,
} from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { Store } from "./store.mjs";
import { Vault } from "./vault.mjs";
import { Actions, alive } from "./actions.mjs";
import { Relay, reservation } from "./relay.mjs";
import {
  models,
  endpoint,
  generate,
  providers,
  catalog,
} from "./providers.mjs";
import { generateMod, example } from "./fabric.mjs";
import { safePath, list, readText, restore, diff } from "./files.mjs";
import { previewUpload, publish } from "./publish.mjs";
import { gitState, recoverCheckpoint } from "./checkpoint.mjs";

const packageInfo = JSON.parse(
  fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
app.setName(packageInfo.productName);
protocol.registerSchemesAsPrivileged([
  {
    scheme: "relay",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const home = "relay://workspace/index.html";
const dist = fileURLToPath(new URL("../dist/", import.meta.url));
let win,
  store,
  vault,
  actions,
  relay,
  root = "",
  plan = null,
  probing = false;
const send = (data) => {
  if (win && !win.isDestroyed()) win.webContents.send("relay:update", data);
};
const notify = () => send({ type: "change" });
const confirm = async (title, detail) =>
  (
    await dialog.showMessageBox(win, {
      type: "question",
      title,
      message: title,
      detail,
      buttons: ["Ablehnen", "Freigeben"],
      defaultId: 0,
      cancelId: 0,
    })
  ).response === 1;
async function directory(label) {
  const r = await dialog.showOpenDialog(win, {
    title: label,
    properties: ["openDirectory", "createDirectory"],
  });
  return r.canceled ? null : fs.realpathSync(r.filePaths[0]);
}
function select(folder) {
  const full = fs.realpathSync(folder);
  if (!fs.statSync(full).isDirectory()) throw Error("Projektordner fehlt.");
  root = full;
  store.project(root);
  store.set("current", root);
  plan = null;
  notify();
}
function taskFor(id) {
  const task = store.one("SELECT * FROM tasks WHERE id=? AND root=?", id, root);
  if (!task) throw Error("Aufgabe gehört nicht zum geöffneten Projekt.");
  return task;
}
function latest() {
  return store.one(
    "SELECT * FROM tasks WHERE root=? ORDER BY created DESC,rowid DESC LIMIT 1",
    root,
  );
}
function publicConnections() {
  return store
    .setting("connections", [])
    .map((c) => ({ ...c, hasKey: !!store.setting("secret:" + c.id, null) }));
}
function snapshot(id) {
  const tasks = store.all(
    "SELECT * FROM tasks WHERE root=? ORDER BY created DESC,rowid DESC",
    root,
  );
  const task = id ? tasks.find((t) => t.id === id) : tasks[0];
  const rows = task
    ? store
        .all(
          "SELECT id,step,kind,status,result,args,pid FROM actions WHERE task=? ORDER BY rowid",
          task.id,
        )
        .map((a) => ({
          ...a,
          args: JSON.parse(a.args),
          running: a.pid ? alive(a.pid) : false,
        }))
    : [];
  return {
    brand: packageInfo.productName,
    root,
    projects: store.all("SELECT root FROM projects ORDER BY touched DESC"),
    config: store.config(root),
    connections: publicConnections(),
    tasks,
    task,
    actions: rows,
    events: task
      ? store.all("SELECT * FROM events WHERE task=? ORDER BY id", task.id)
      : [],
    usage: store.one(
      "SELECT sum(input) AS input,sum(output) AS output,sum(cost) AS cost,count(*)-count(cost) AS unknown FROM usage WHERE root=?",
      root,
    ),
    example,
  };
}
function requireIdle() {
  if (relay.runs.size || probing)
    throw Error("Zuerst die laufende Aufgabe oder Prüfung beenden.");
}
async function handle(op, a) {
  if (op === "state") return snapshot(a.id);
  if (op === "open") {
    requireIdle();
    const folder = await directory("Projektordner auswählen");
    if (folder) select(folder);
    return;
  }
  if (op === "recent") {
    requireIdle();
    if (!store.one("SELECT root FROM projects WHERE root=?", a.root))
      throw Error("Unbekanntes Projekt.");
    select(a.root);
    return;
  }
  if (op === "fabric") {
    requireIdle();
    if (
      [a.name, a.id, a.features].some(
        (v) => typeof v === "string" && vault.clean(v) !== v,
      )
    )
      throw Error("Modangaben enthalten Zugangsdaten.");
    const parent = await directory(
      "Übergeordneten Ordner für die neue Mod wählen",
    );
    if (parent) {
      select(await generateMod(parent, a));
      if (a.features) store.task(root, vault.clean(a.features));
      notify();
    }
    return;
  }
  if (op === "connect") {
    requireIdle();
    const base = endpoint(a.type, a.base);
    const all = publicConnections();
    const existing = all.find((c) => c.id === a.id);
    const sameEndpoint = existing?.base === base && existing.type === a.type;
    const id = sameEndpoint ? existing.id : randomUUID();
    const key = a.key || (sameEndpoint && vault.get(id)) || "";
    if (!key && !["compatible", "ollama"].includes(a.type))
      throw Error("API-Schlüssel erforderlich.");
    const c = {
      id,
      name: String(a.name || providers[a.type].name),
      type: a.type,
      base,
      group: String(a.group || base),
      models: [],
      verified: [],
    };
    try {
      c.models = await models(c, key);
    } catch (e) {
      throw Error(key ? e.message.replaceAll(key, "[geschützt]") : e.message);
    }
    if (key && JSON.stringify(c).includes(key))
      throw Error("Verbindungsdaten enthalten den API-Schlüssel.");
    if (!c.models.length)
      throw Error("Der Zugang meldet keine verfügbaren Modelle.");
    vault.save(id, key);
    store.set("connections", [...all.filter((x) => x.id !== id), c]);
    notify();
    return c;
  }
  if (!root) throw Error("Bitte zuerst einen Projektordner öffnen.");
  if (op === "list") return list(root, a.dir);
  if (op === "git") return gitState(root);
  if (op === "checkpoint" || op === "recoverFile") {
    const row = store.one(
      "SELECT files,task FROM checkpoints JOIN actions ON actions.id=checkpoints.action WHERE action=?",
      a.id,
    );
    if (!row) throw Error("Kein Wiederherstellungspunkt vorhanden.");
    taskFor(row.task);
    const files = JSON.parse(row.files);
    if (op === "checkpoint") return Object.keys(files);
    requireIdle();
    if (await confirm("Datei auf früheren Stand zurücksetzen?", a.path))
      recoverCheckpoint(root, files, a.path);
    return;
  }
  if (op === "read") {
    const content = readText(root, a.path);
    if (vault.clean(content) !== content)
      throw Error("Datei enthält geschützte Zugangsdaten.");
    return content;
  }
  if (op === "reveal") {
    const file = safePath(root, a.path || "");
    shell.showItemInFolder(file);
    return;
  }
  if (op === "previewUrl") {
    const url = new URL(a.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.username ||
      url.password
    )
      throw Error("Nur lokale Vorschauadressen sind zulässig.");
    await shell.openExternal(url.href);
    return;
  }
  if (op === "settings") {
    requireIdle();
    const config = store.config(root);
    const chain = (a.chain || []).map((m) => {
      const c = publicConnections().find((x) => x.id === m.connection);
      if (!c?.verified.includes(JSON.stringify([m.id, m.effort || ""])))
        throw Error("Modell und Denkintensität zuerst prüfen.");
      return {
        connection: c.id,
        id: m.id,
        effort: m.effort || "",
        inputPrice: m.inputPrice ?? null,
        outputPrice: m.outputPrice ?? null,
      };
    });
    if (a.budget != null && (!Number.isFinite(a.budget) || a.budget < 0))
      throw Error("Budget ungültig.");
    for (const m of chain)
      for (const p of [m.inputPrice, m.outputPrice])
        if (p != null && (!Number.isFinite(p) || p < 0))
          throw Error("Preis ungültig.");
    store.configure(root, {
      ...config,
      chain,
      terminal: !!a.terminal,
      budget: a.budget ?? null,
    });
    notify();
    return;
  }
  if (op === "probe") {
    requireIdle();
    probing = true;
    try {
      const all = publicConnections(),
        c = all.find((x) => x.id === a.connection);
      if (!c || !a.id?.trim())
        throw Error("Verbindung und Modell erforderlich.");
      const m = {
        id: a.id,
        effort: a.effort || "",
        inputPrice: a.inputPrice ?? null,
        outputPrice: a.outputPrice ?? null,
      };
      if (
        m.effort &&
        (c.type !== "openai" || !catalog[m.id]?.efforts.includes(m.effort))
      )
        throw Error("Denkintensität für dieses Modell unbekannt.");
      const input =
        "Funktionsprüfung ohne Projektzugriff. Antworte mit relay_action: kind plan, step probe, text bereit, alle anderen Felder leer.";
      const settle = reservation(store, root, c, m, input);
      const result = await generate(
        c,
        vault.get(c.id),
        m,
        input,
        AbortSignal.timeout(120000),
      );
      settle(result);
      if (result.action.kind !== "plan" || result.action.step !== "probe")
        throw Error("Werkzeugprüfung nicht bestanden.");
      const ident = JSON.stringify([m.id, m.effort]);
      if (!c.verified.includes(ident)) c.verified.push(ident);
      if (!c.models.some((x) => x.id === m.id))
        c.models.push({
          id: m.id,
          name: m.id,
          efforts: catalog[m.id]?.efforts || [],
        });
      store.set("connections", all);
      notify();
      return;
    } finally {
      probing = false;
    }
  }
  if (op === "resetLimit") {
    requireIdle();
    const c = publicConnections().find((x) => x.id === a.id);
    if (c)
      store.run(
        "DELETE FROM cooldowns WHERE scope=?",
        c.type + "|" + (c.group || c.base),
      );
    return;
  }
  if (op === "save") {
    requireIdle();
    let task = latest();
    if (!task) {
      task = taskFor(store.task(root, "Manuelle Bearbeitung"));
    }
    const file = safePath(root, a.path);
    const previous = fs.existsSync(file) ? readText(root, a.path) : null;
    if (previous !== a.before)
      throw Error("Datei extern geändert. Bitte neu öffnen.");
    if (previous === a.text) return;
    await actions.manualSave(task, a.path, previous, a.text);
    notify();
    return;
  }
  if (op === "start") {
    requireIdle();
    if (!a.prompt?.trim()) throw Error("Auftrag fehlt.");
    if (vault.clean(a.prompt) !== a.prompt)
      throw Error("Auftrag enthält Zugangsdaten.");
    const id = store.task(root, a.prompt.trim());
    void relay.run(id);
    return id;
  }
  if (op === "resume") {
    requireIdle();
    taskFor(a.id);
    void relay.run(a.id);
    return;
  }
  if (op === "halt") {
    taskFor(a.id);
    await relay.halt(a.id, !!a.cancel);
    return;
  }
  if (op === "ack" || op === "restore" || op === "stop") {
    const row = store.one("SELECT * FROM actions WHERE id=?", a.id);
    if (!row) throw Error("Aktion fehlt.");
    taskFor(row.task);
    if (op === "stop") {
      if (!actions.children.has(a.id))
        throw Error(
          "Prozess stammt aus einer früheren Sitzung. PID im Task-Manager prüfen.",
        );
      await actions.stop(a.id);
    } else if (op === "ack" && row.status === "uncertain") {
      requireIdle();
      if (
        await confirm(
          "Unterbrechung geprüft?",
          row.result +
            "\nDie Aktion bleibt im Verlauf und wird nicht wiederholt.",
        )
      )
        store.run("UPDATE actions SET status='reviewed' WHERE id=?", row.id);
    } else if (op === "restore") {
      requireIdle();
      if (await confirm("Datei wiederherstellen?", JSON.parse(row.args).path)) {
        restore(root, row);
        store.run("UPDATE actions SET status='restored' WHERE id=?", row.id);
      }
    }
    notify();
    return;
  }
  if (op === "terminal") {
    requireIdle();
    const t = latest() || taskFor(store.task(root, "Terminal"));
    await actions.execute(
      t,
      {
        step: randomUUID(),
        kind: a.preview ? "preview" : "run",
        path: "",
        text: a.text,
        old: "",
      },
      new AbortController().signal,
    );
    notify();
    return;
  }
  if (op === "uploadPreview") {
    requireIdle();
    plan = await previewUpload(root, a.repo, a.visibility, (s) =>
      vault.clean(s),
    );
    return plan;
  }
  if (op === "publish") {
    requireIdle();
    if (!plan || plan.root !== root) throw Error("Vorschau fehlt.");
    const checked = plan;
    plan = null;
    return await publish(checked, (s) => vault.clean(s));
  }
  throw Error("Unbekannte Aktion.");
}
if (!app.requestSingleInstanceLock()) app.quit();
else
  app.whenReady().then(async () => {
    store = new Store(path.join(app.getPath("userData"), "workspace.sqlite"));
    vault = new Vault(store);
    actions = new Actions(store, confirm, (s) => vault.clean(s), notify);
    actions.recover();
    relay = new Relay(store, actions, {
      key: (id) => vault.get(id),
      clean: (s) => vault.clean(s),
      notify,
      stream: (id, text) => send({ type: "delta", id, text }),
    });
    const last = store.setting("current", "");
    if (last && fs.existsSync(last)) select(last);
    protocol.handle("relay", (request) => {
      const url = new URL(request.url);
      if (url.host !== "workspace") return new Response(null, { status: 403 });
      const file = path.resolve(dist, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(dist)) return new Response(null, { status: 403 });
      return net.fetch(pathToFileURL(file).href);
    });
    session.defaultSession.setPermissionRequestHandler(
      (_web, _perm, callback) => callback(false),
    );
    ipcMain.handle("relay", async (e, op, args) => {
      if (e.senderFrame?.url !== home) throw Error("Unbekannte Oberfläche.");
      try {
        return await handle(op, args || {});
      } catch (err) {
        throw Error(vault.clean(err.message));
      }
    });
    Menu.setApplicationMenu(null);
    win = new BrowserWindow({
      title: packageInfo.productName,
      width: 1540,
      height: 940,
      minWidth: 990,
      minHeight: 650,
      backgroundColor: "#101218",
      icon: fileURLToPath(new URL("../assets/icon.ico", import.meta.url)),
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.cjs", import.meta.url)),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e, url) => {
      if (url !== home) e.preventDefault();
    });
    win.webContents.on("will-prevent-unload", (event) => {
      if (
        dialog.showMessageBoxSync(win, {
          message: "Ungespeicherte Änderungen verwerfen und beenden?",
          buttons: ["Weiter bearbeiten", "Verwerfen"],
          defaultId: 0,
          cancelId: 0,
        }) === 1
      )
        event.preventDefault();
    });
    await win.loadURL(home);
  });
app.on("before-quit", () => {
  for (const control of relay?.runs.values() ?? []) control.abort();
  for (const id of actions?.children.keys() ?? []) void actions.stop(id);
});
app.on("window-all-closed", () => app.quit());
