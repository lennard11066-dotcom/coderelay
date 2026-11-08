import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  Suspense,
  lazy,
} from "react";
import { createRoot } from "react-dom/client";
import {
  FolderOpen,
  Folder,
  FileCode2,
  Files,
  Settings2,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Terminal,
  Box,
  Plus,
  X,
  Save,
  ArrowUpRight,
  ArrowUp,
  Network,
  SquareTerminal,
  PanelLeft,
  Clock3,
  Pause,
  Play,
  Square,
  Send,
  Layers3,
  History,
  Workflow,
  CircleDot,
  CheckCheck,
  ChevronsRight,
  Braces,
  Activity,
  RefreshCw,
  Monitor,
  Undo2,
  ShieldCheck,
  Link2,
  Code2,
  ArrowRight,
} from "lucide-react";
import {
  api,
  short,
  errorText,
  unavailable,
  actionLabel,
  State,
  Entry,
} from "./types";
import Settings from "./settings";
import { History as ProjectHistory } from "./history";
import { Fabric, Upload } from "./dialogs";
import logo from "../assets/logo.svg";
import "./style.css";
const Editor = lazy(() => import("./editor"));
type Doc = {
  path: string;
  text: string;
  before: string | null;
  version: number;
};
function IconButton({
  title,
  onClick,
  children,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Tree({
  dir,
  openFile,
  active,
  version,
  onError,
}: {
  dir: string;
  openFile: (p: string) => void;
  active: string;
  version: number;
  onError: (msg: string) => void;
}) {
  const [entries, setEntries] = useState<Entry[]>([]),
    [expanded, setExpanded] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    api<Entry[]>("list", { dir })
      .then((v) => {
        if (live) setEntries(v);
      })
      .catch((e) => {
        if (live) onError(errorText(e));
      });
    return () => {
      live = false;
    };
  }, [dir, version]);
  return (
    <div className="tree">
      {entries.map((e) => (
        <React.Fragment key={e.path}>
          <button
            className={active === e.path ? "selected" : ""}
            onClick={() =>
              e.folder
                ? setExpanded(
                    expanded.includes(e.path)
                      ? expanded.filter((p) => p !== e.path)
                      : [...expanded, e.path],
                  )
                : openFile(e.path)
            }
          >
            {e.folder ? (
              expanded.includes(e.path) ? (
                <ChevronDown />
              ) : (
                <ChevronRight />
              )
            ) : (
              <span className="indent" />
            )}
            {e.folder ? (
              <Folder className="folder" />
            ) : (
              <FileCode2 className="file" />
            )}
            <span>{e.name}</span>
          </button>
          {e.folder && expanded.includes(e.path) && (
            <div className="nested">
              <Tree dir={e.path} {...{ openFile, active, version, onError }} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
function resize(e: React.PointerEvent, fn: (dx: number, dy: number) => void) {
  const { clientX: x, clientY: y } = e;
  e.currentTarget.setPointerCapture(e.pointerId);
  const el = e.currentTarget as HTMLElement;
  const move = (ev: PointerEvent) => fn(ev.clientX - x, ev.clientY - y);
  const stop = () => {
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", stop);
    el.removeEventListener("pointercancel", stop);
  };
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
}
function Welcome({
  project,
  brand,
  open,
  fabric,
  settings,
}: {
  project: string;
  brand: string;
  open: () => void;
  fabric: () => void;
  settings: () => void;
}) {
  return (
    <div className="welcome">
      <div className="relayArt" aria-hidden="true">
        <div className="circuit">
          <span className="node node1">
            <Braces />
          </span>
          <i />
          <span className="node core">
            <img src={logo} />
          </span>
          <i />
          <span className="node node2">
            <Layers3 />
          </span>
        </div>
      </div>
      <div className="welcomeBody">
        <h1>{project ? short(project) : brand}</h1>
        <p>
          {project
            ? "Wähle eine Datei im Explorer oder beschreibe deinen nächsten Auftrag."
            : "Öffne ein lokales Projekt oder starte mit einer Fabric-Mod."}
        </p>
        <div className="quick">
          <button onClick={open}>
            <FolderOpen />
            <span>Projekt öffnen</span>
            <ArrowUpRight />
          </button>
          <button onClick={fabric}>
            <Box />
            <span>Fabric-Mod erstellen</span>
            <ArrowUpRight />
          </button>
          <button onClick={settings}>
            <Link2 />
            <span>Anbieter verbinden</span>
            <ArrowUpRight />
          </button>
        </div>
      </div>
    </div>
  );
}
function App() {
  const [s, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [modal, setModal] = useState(""),
    [settingsTab, setSettingsTab] = useState("Anbieter"),
    [left, setLeft] = useState(true),
    [leftW, setLeftW] = useState(216),
    [rightW, setRightW] = useState(342),
    [bottomH, setBottomH] = useState(190);
  const [docs, setDocs] = useState<Doc[]>([]),
    [active, setActive] = useState(""),
    [prompt, setPrompt] = useState(""),
    [right, setRight] = useState("Chat"),
    [bottom, setBottom] = useState("Terminal"),
    [cmd, setCmd] = useState(""),
    [url, setUrl] = useState(""),
    [draftPath, setDraftPath] = useState(""),
    [version, setVersion] = useState(0),
    [delta, setDelta] = useState(""),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false);
  const taskId = useRef(""),
    root = useRef(""),
    rev = useRef(0),
    docRef = useRef(docs);
  docRef.current = docs;
  const refresh = useCallback(async () => {
    const n = ++rev.current;
    const next = await api<State>("state", { id: taskId.current });
    if (n !== rev.current) return;
    if (next.root !== root.current) {
      root.current = next.root;
      taskId.current = "";
      setDocs([]);
      setActive("");
      setCmd("");
      setPrompt("");
      setDelta("");
    }
    setState(next);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(errorText(e)));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = window.relay.listen((e) => {
      if (e.type === "delta") {
        if (!taskId.current || taskId.current === e.id)
          setDelta((v) => (v + e.text).slice(-2000));
      } else if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          void refresh().catch((e) => setError(errorText(e)));
        }, 100);
    });
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [refresh]);
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(errorText(e));
    }
  };
  const openSettings = (tab: string) => {
    setSettingsTab(tab);
    setModal("Einstellungen");
  };
  function safeSwitch(fn: () => void) {
    if (
      !docs.some((d) => d.text !== d.before) ||
      window.confirm(
        "Ungespeicherte Änderungen verwerfen und Projekt wechseln?",
      )
    )
      fn();
  }
  const openProject = () =>
    safeSwitch(() => {
      void run(() => api("open"));
    });
  const openFile = async (p: string, reload = false) => {
    if (!reload && docs.some((d) => d.path === p)) {
      setActive(p);
      return;
    }
    const text = await api<string>("read", { path: p });
    setDocs((v) => [
      ...v.filter((d) => d.path !== p),
      { path: p, text, before: text, version: Date.now() },
    ]);
    setActive(p);
  };
  const doc = docs.find((d) => d.path === active);
  async function save() {
    if (!doc) return;
    await api("save", { path: doc.path, text: doc.text, before: doc.before });
    setDocs((v) =>
      v.map((d) => (d.path === doc.path ? { ...d, before: doc.text } : d)),
    );
    setVersion((v) => v + 1);
  }
  const task = s?.task,
    chain = s?.config.chain ?? [],
    running = task?.status === "läuft";
  useEffect(() => {
    if (!running) setDelta("");
  }, [running]);
  useEffect(() => {
    setVersion((v) => v + 1);
  }, [s?.actions.length, s?.root]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (docRef.current.some((d) => d.text !== d.before)) {
        e.preventDefault();
        e.returnValue = false;
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  if (!s)
    return (
      <div className="loading">{error || "Arbeitsbereich wird geöffnet …"}</div>
    );
  const openMod = () => safeSwitch(() => setModal("Fabric-Projektassistent"));
  const start = () =>
    run(async () => {
      const id = await api<string>("start", { prompt });
      taskId.current = id;
      setSelected(id);
      setPrompt("");
      setDelta("");
      setRight("Chat");
    });
  const chooseTask = (id: string) => {
    taskId.current = id;
    setSelected(id);
    setDelta("");
    void refresh();
  };
  const commands = s.actions.filter((a) => ["run", "preview"].includes(a.kind));
  const issues = s.events.filter((e) => ["Fehler", "Pause"].includes(e.kind));

  const terminal = async (text: string, preview = false) => {
    setBusy(true);
    try {
      await api("terminal", { text, preview });
      setCmd("");
      setVersion((v) => v + 1);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app">
      <header>
        <div className="brand">
          <img src={logo} />
          {s.brand}
        </div>
        <div className="crumb">
          <span>/</span>
          <Folder size={14} />
          {s.root ? short(s.root) : "Arbeitsbereich"}
        </div>
        <div className="headerRight">
          <span className="local">
            <i /> Lokal
          </span>
          <button onClick={() => openSettings("Anbieter")}>
            <Settings2 size={14} />
            Einstellungen
          </button>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail">
          <IconButton
            title="Explorer einblenden"
            onClick={() => setLeft(!left)}
          >
            <Files />
          </IconButton>
          <IconButton title="Projekt öffnen" onClick={openProject}>
            <FolderOpen />
          </IconButton>
          <IconButton title="Fabric-Projektassistent" onClick={openMod}>
            <Box />
          </IconButton>
          <IconButton
            title="GitHub-Upload"
            disabled={!s.root}
            onClick={() => setModal("Auf GitHub veröffentlichen")}
          >
            <GitBranch />
          </IconButton>
          <div className="spacer" />
          <IconButton
            title="Modellreihenfolge"
            onClick={() => openSettings("Modelle")}
          >
            <Workflow />
          </IconButton>
          <IconButton
            title="Berechtigungen"
            onClick={() => openSettings("Berechtigungen")}
          >
            <ShieldCheck />
          </IconButton>
        </nav>
        {left && (
          <>
            <aside className="explorer" style={{ width: leftW }}>
              <div className="paneHead">
                <span>Explorer</span>
                <IconButton title="Projekt öffnen" onClick={openProject}>
                  <FolderOpen />
                </IconButton>
              </div>
              <div className="subhead">PROJEKTE</div>
              {s.projects.length ? (
                s.projects.map((p) => (
                  <button
                    className={
                      "project " + (p.root === s.root ? "current" : "")
                    }
                    key={p.root}
                    title={p.root}
                    onClick={() =>
                      safeSwitch(() => {
                        void run(() => api("recent", { root: p.root }));
                      })
                    }
                  >
                    <Folder size={15} />
                    {short(p.root)}
                  </button>
                ))
              ) : (
                <button className="openLink" onClick={openProject}>
                  <Plus size={14} />
                  Ordner öffnen
                </button>
              )}
              <div className="subhead fileHead">
                DATEIEN{" "}
                <div>
                  <IconButton
                    title="Neue Datei"
                    disabled={!s.root}
                    onClick={() => setModal("Neue Datei")}
                  >
                    <Plus />
                  </IconButton>
                  <IconButton
                    title="Dateibaum aktualisieren"
                    disabled={!s.root}
                    onClick={() => setVersion((v) => v + 1)}
                  >
                    <RefreshCw />
                  </IconButton>
                </div>
              </div>
              <div className="fileArea">
                {s.root ? (
                  <Tree
                    key={s.root}
                    dir=""
                    openFile={(p) => {
                      void run(() => openFile(p));
                    }}
                    active={active}
                    version={version}
                    onError={setError}
                  />
                ) : (
                  <div className="emptyExplorer">
                    <FolderOpen size={25} />
                    <p>Kein Projekt geöffnet</p>
                  </div>
                )}
              </div>
              <div className="explorerFoot">
                <ShieldCheck size={14} /> Lokaler Arbeitsbereich
              </div>
            </aside>
            <div
              className="divider v"
              onPointerDown={(e) =>
                resize(e, (dx) =>
                  setLeftW(Math.max(150, Math.min(340, leftW + dx))),
                )
              }
            />
          </>
        )}
        <main>
          <div className="tabs">
            <button
              className={!active ? "chosen" : ""}
              onClick={() => setActive("")}
            >
              <img src={logo} />
              Übersicht
            </button>
            {docs.map((d) => (
              <div
                key={d.path}
                className={"docTab " + (active === d.path ? "chosen" : "")}
              >
                <button onClick={() => setActive(d.path)}>
                  <FileCode2 size={13} />
                  {short(d.path)}
                  {d.text !== d.before ? " ●" : ""}
                </button>
                <IconButton
                  title="Tab schließen"
                  onClick={() => {
                    if (
                      d.text !== d.before &&
                      !window.confirm("Änderungen verwerfen?")
                    )
                      return;
                    setDocs(docs.filter((v) => v.path !== d.path));
                    if (active === d.path) setActive("");
                  }}
                >
                  <X />
                </IconButton>
              </div>
            ))}
          </div>
          {doc ? (
            <>
              <div className="editorBar">
                <span title={doc.path}>{doc.path}</span>
                <IconButton
                  title="Datei neu laden"
                  onClick={() => {
                    if (
                      doc.text === doc.before ||
                      window.confirm("Änderungen verwerfen?")
                    )
                      void run(() => openFile(doc.path, true));
                  }}
                >
                  <RefreshCw />
                </IconButton>
                <IconButton
                  title="Speichern"
                  onClick={() => {
                    void run(save);
                  }}
                >
                  <Save />
                </IconButton>
              </div>
              <Suspense fallback={<p>Editor wird geladen …</p>}>
                <Editor
                  key={doc.path + doc.version}
                  file={doc.path}
                  value={doc.text}
                  onChange={(text) =>
                    setDocs((v) =>
                      v.map((d) => (d.path === active ? { ...d, text } : d)),
                    )
                  }
                  onSave={() => {
                    void run(save);
                  }}
                />
              </Suspense>
            </>
          ) : (
            <Welcome
              project={s.root}
              brand={s.brand}
              open={openProject}
              fabric={openMod}
              settings={() => openSettings("Anbieter")}
            />
          )}
          <div
            className="divider h"
            onPointerDown={(e) =>
              resize(e, (_dx, dy) =>
                setBottomH(
                  Math.max(
                    110,
                    Math.min(window.innerHeight * 0.55, bottomH - dy),
                  ),
                ),
              )
            }
          />
          <section className="console" style={{ height: bottomH }}>
            <div className="bottomTabs">
              {["Terminal", "Probleme", "Build", "Änderungen"].map((x) => (
                <button
                  className={x === bottom ? "active" : ""}
                  key={x}
                  onClick={() => setBottom(x)}
                >
                  {x === "Terminal" && <SquareTerminal size={14} />} {x}
                  {x === "Probleme" && issues.length > 0
                    ? " · " + issues.length
                    : ""}
                </button>
              ))}
            </div>
            <div className="output">
              {bottom === "Terminal" ? (
                <>
                  <div className="termTitle">
                    <i />
                    {s.root ? s.root : "Lokales Terminal"} <span>cmd</span>
                  </div>
                  {commands.map((a) => (
                    <div key={a.id}>
                      <code>› {a.args.text}</code>
                      <pre>{a.result || "Prozess läuft …"}</pre>
                      {a.running && (
                        <button
                          onClick={() => run(() => api("stop", { id: a.id }))}
                        >
                          PID {a.pid} stoppen
                        </button>
                      )}
                    </div>
                  ))}
                  {!commands.length && (
                    <p>
                      {s.root
                        ? "Bereit für einen Befehl."
                        : "Zum Ausführen von Befehlen ein Projekt öffnen."}
                    </p>
                  )}
                </>
              ) : bottom === "Probleme" ? (
                <>
                  {issues.length ? (
                    issues.map((e) => (
                      <p key={e.id}>
                        {e.kind} · {e.body}
                      </p>
                    ))
                  ) : (
                    <p>Keine gemeldeten Probleme.</p>
                  )}
                </>
              ) : bottom === "Änderungen" ? (
                <>
                  <ProjectHistory
                    id={task?.id}
                    root={s.root}
                    actions={s.actions}
                  />
                  {s.actions
                    .filter((a) => a.kind === "write")
                    .map((a) => (
                      <details key={a.id}>
                        <summary>
                          {a.args.path} · {actionLabel(a.status)}
                        </summary>
                        <pre>{a.result}</pre>
                        <button
                          disabled={a.status !== "done"}
                          onClick={() =>
                            run(() => api("restore", { id: a.id }))
                          }
                        >
                          <Undo2 size={13} />
                          Wiederherstellen
                        </button>
                      </details>
                    ))}
                  {!s.actions.some((a) => a.kind === "write") && (
                    <p>Keine Dateiänderungen in dieser Aufgabe.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="buttons">
                    <button
                      disabled={!s.root || busy}
                      onClick={() => run(() => terminal("gradlew.bat build"))}
                    >
                      <Play size={12} />
                      Fabric bauen
                    </button>
                    <button
                      disabled={!s.root || busy}
                      onClick={() =>
                        run(() => terminal("gradlew.bat runClient", true))
                      }
                    >
                      Entwicklungsclient
                    </button>
                    <button
                      disabled={!s.root}
                      onClick={() =>
                        run(async () => {
                          const jars = (
                            await api<Entry[]>("list", { dir: "build/libs" })
                          ).filter(
                            (x) =>
                              /\.jar$/.test(x.path) &&
                              !/-sources|-dev|-javadoc/.test(x.path),
                          );
                          if (!jars.length)
                            throw Error("Keine verwendbare Mod-JAR gefunden.");
                          await api("reveal", { path: jars[0].path });
                        })
                      }
                    >
                      Mod-JAR anzeigen
                    </button>
                  </div>
                  {commands
                    .filter((a) => /build|gradle|test/i.test(a.args.text || ""))
                    .map((a) => (
                      <details key={a.id}>
                        <summary>
                          {a.args.text} · {a.result.split("\n")[0]}
                        </summary>
                        <pre>{a.result}</pre>
                      </details>
                    ))}
                  <p>Funktionstest im Spiel · Manuelle Prüfung offen</p>
                  <div className="cmd">
                    <Monitor size={14} />
                    <input
                      placeholder="http://localhost:… "
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <IconButton
                      title="Lokale Vorschau öffnen"
                      onClick={() => run(() => api("previewUrl", { url }))}
                    >
                      <ArrowUpRight />
                    </IconButton>
                  </div>
                </>
              )}
            </div>
            {bottom === "Terminal" && (
              <form
                className="cmd"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(() => terminal(cmd));
                }}
              >
                <Terminal size={16} />
                <input
                  aria-label="Terminalbefehl"
                  placeholder="Befehl eingeben"
                  value={cmd}
                  onChange={(e) => setCmd(e.target.value)}
                  disabled={!s.root || busy}
                />
                <button disabled={!cmd || !s.root || busy} title="Ausführen">
                  <ArrowRight size={14} />
                </button>
              </form>
            )}
          </section>
        </main>
        <div
          className="divider v"
          onPointerDown={(e) =>
            resize(e, (dx) =>
              setRightW(Math.max(265, Math.min(480, rightW - dx))),
            )
          }
        />
        <aside className="assistant" style={{ width: rightW }}>
          <div className="paneHead">
            <span>
              <Network size={17} /> KI-Assistent
            </span>
            <IconButton
              title="Modellauswahl"
              onClick={() => openSettings("Modelle")}
            >
              <Settings2 />
            </IconButton>
          </div>
          <div className="assistantTabs">
            {["Chat", "Plan", "Verlauf"].map((x) => (
              <button
                key={x}
                className={right === x ? "active" : ""}
                onClick={() => setRight(x)}
              >
                {x}
              </button>
            ))}
          </div>
          <div className="chatContent">
            {s.tasks.length > 0 && (
              <select
                aria-label="Aufgabe auswählen"
                value={task?.id || selected}
                onChange={(e) => chooseTask(e.target.value)}
              >
                {s.tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.prompt.slice(0, 45)}
                  </option>
                ))}
              </select>
            )}
            {right === "Chat" ? (
              task ? (
                <>
                  <div className="message userMsg">
                    <small>DU</small>
                    {task.prompt}
                  </div>
                  {s.events
                    .filter((e) => !["Wartezeit"].includes(e.kind))
                    .map((e) => (
                      <div
                        key={e.id}
                        className={
                          "message " + (e.kind === "Übergabe" ? "handoff" : "")
                        }
                      >
                        <small>{e.kind.toLocaleUpperCase("de")}</small>
                        {e.body}
                      </div>
                    ))}
                  {delta && <p className="message">{delta}</p>}
                </>
              ) : (
                <div className="chatEmpty">
                  <div className="assistantMark">
                    <Workflow size={24} />
                  </div>
                  <h3>Neuer Auftrag</h3>
                  <p>
                    Beschreibe, was du in deinem Projekt erstellen oder ändern
                    möchtest.
                  </p>
                  <button onClick={() => setPrompt(s.example)}>
                    <Box size={15} />
                    <span>Fabric-HUD als Beispiel</span>
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              )
            ) : right === "Plan" ? (
              <>
                <h3>Aufgabenplan</h3>
                <div className="message">
                  {task?.plan ||
                    "Der Plan erscheint, sobald das Modell das Projekt untersucht hat."}
                </div>
              </>
            ) : (
              <>
                <h3>Werkzeugaktionen</h3>
                {s.actions.map((a) => (
                  <details key={a.id}>
                    <summary>
                      {actionLabel(a.kind)} · {actionLabel(a.status)} ·{" "}
                      {a.args.path || a.step}
                    </summary>
                    <pre>{a.result}</pre>
                    {a.status === "uncertain" && (
                      <button
                        onClick={() => run(() => api("ack", { id: a.id }))}
                      >
                        Zustand geprüft
                      </button>
                    )}
                  </details>
                ))}
                {!s.actions.length && <p>Keine Aktionen protokolliert.</p>}
              </>
            )}
          </div>
          {task && (
            <div className="taskControl">
              <span className="pill">
                <i />
                {task.status}
              </span>
              {running ? (
                <IconButton
                  title="Pausieren"
                  onClick={() => run(() => api("halt", { id: task.id }))}
                >
                  <Pause />
                </IconButton>
              ) : (
                <IconButton
                  title="Fortsetzen"
                  disabled={task.status !== "pausiert"}
                  onClick={() => run(() => api("resume", { id: task.id }))}
                >
                  <Play />
                </IconButton>
              )}
              <IconButton
                title="Abbrechen"
                disabled={!["läuft", "pausiert"].includes(task.status)}
                onClick={() =>
                  run(() => api("halt", { id: task.id, cancel: true }))
                }
              >
                <Square />
              </IconButton>
            </div>
          )}
          <div className="composer">
            <textarea
              placeholder="Auftrag beschreiben …"
              aria-label="Neuer Auftrag"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  e.ctrlKey &&
                  prompt.trim() &&
                  s.root &&
                  !running
                )
                  void start();
              }}
            />
            <div>
              <span>Strg + Enter</span>
              <button
                className="send"
                title="Auftrag starten"
                disabled={!s.root || !prompt.trim() || running}
                onClick={start}
              >
                <ArrowUp size={17} />
              </button>
            </div>
          </div>
          <div className="relayList">
            <div className="subhead">
              <span>
                <Workflow size={13} /> MODELLREIHENFOLGE
              </span>
              <IconButton
                title="Modelle verwalten"
                onClick={() => openSettings("Modelle")}
              >
                <Settings2 />
              </IconButton>
            </div>
            {chain.length ? (
              chain.map((m, i) => (
                <div className="chainItem" key={i}>
                  <i className={task?.model === m.id ? "lit" : ""} />
                  <span>
                    {m.id} {m.effort}
                  </span>
                  <small>{i ? "Ersatz " + i : "Primär"}</small>
                </div>
              ))
            ) : (
              <button
                className="setupLink"
                onClick={() => openSettings("Modelle")}
              >
                <Plus size={14} /> Modell freigeben
              </button>
            )}
          </div>
        </aside>
      </div>
      <footer>
        <span>
          <CircleDot size={12} />
          {task?.status || "Bereit"}
        </span>
        <span>
          <Network size={12} />
          {task?.model || chain[0]?.id || "Kein Modell"}
        </span>
        <div className="spacer" />
        <span title="Eingabe und Ausgabe">
          {s.usage.input != null || s.usage.output != null
            ? ((s.usage.input || 0) + (s.usage.output || 0)).toLocaleString(
                "de",
              ) + " Token"
            : "Token · " + unavailable}
        </span>
        <span>
          Schätzung ·{" "}
          {s.usage.cost != null && !s.usage.unknown
            ? s.usage.cost.toFixed(4) + " USD"
            : unavailable}
        </span>
      </footer>
      {error && (
        <div role="alert" className="toast">
          <span>{error}</span>
          <IconButton title="Meldung schließen" onClick={() => setError("")}>
            <X />
          </IconButton>
        </div>
      )}
      {modal && (
        <div
          className="overlay"
          onKeyDown={(e) => {
            if (e.key === "Escape") setModal("");
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={modal}
            className="modal"
          >
            <div className="modalHead">
              <h2>{modal}</h2>
              <IconButton title="Schließen" onClick={() => setModal("")}>
                <X />
              </IconButton>
            </div>
            {modal === "Einstellungen" ? (
              <Settings s={s} refresh={refresh} initial={settingsTab} />
            ) : modal === "Fabric-Projektassistent" ? (
              <Fabric
                example={s.example}
                done={() => {
                  setModal("");
                  void refresh();
                }}
              />
            ) : modal === "Neue Datei" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    try {
                      await api("read", { path: draftPath });
                      throw Error("Datei existiert bereits.");
                    } catch (e) {
                      if (!String(e).includes("ENOENT")) throw e;
                    }
                    await api("save", {
                      path: draftPath,
                      text: "",
                      before: null,
                    });
                    await openFile(draftPath);
                    setVersion((v) => v + 1);
                    setModal("");
                    setDraftPath("");
                  });
                }}
              >
                <label>
                  Projektpfad
                  <input
                    autoFocus
                    required
                    value={draftPath}
                    placeholder="src/main.py"
                    onChange={(e) => setDraftPath(e.target.value)}
                  />
                </label>
                <button className="primary">Datei erstellen</button>
              </form>
            ) : (
              <Upload />
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
