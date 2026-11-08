import React, { useState } from "react";
import {
  Cable,
  Layers3,
  ShieldCheck,
  GripVertical,
  Trash2,
  ArrowUp,
  PlugZap,
  Plus,
  Check,
} from "lucide-react";
import {
  api,
  State,
  Choice,
  Connection,
  unavailable,
  errorText,
} from "./types";
const types: Record<string, [string, string, string]> = {
  openai: [
    "OpenAI",
    "https://api.openai.com/v1",
    "Eigener API-Schlüssel und API-Abrechnung. Das ChatGPT-Abo deckt diesen Zugang nicht ab.",
  ],
  anthropic: [
    "Anthropic / Claude",
    "https://api.anthropic.com/v1",
    "Ein Schlüssel der Claude Console mit API-Guthaben ist erforderlich.",
  ],
  gemini: [
    "Google / Gemini",
    "https://generativelanguage.googleapis.com/v1beta",
    "Google AI Studio verwendet einen API-Schlüssel für Ihr Google-Projekt. Kontingente und Abrechnung richten sich nach dessen Tarif.",
  ],
  compatible: [
    "OpenAI-kompatibel",
    "",
    "Endpunkt mit Modellliste und Chat Completions. Kosten und Kontingente bestimmt Ihr Anbieter.",
  ],
  ollama: [
    "Ollama",
    "http://localhost:11434/v1",
    "Ollama lokal starten und ein Modell mit Werkzeugunterstützung herunterladen.",
  ],
};
export default function Settings({
  s,
  initial,
  refresh,
}: {
  s: State;
  initial: string;
  refresh: () => Promise<void>;
}) {
  const [tab, setTab] = useState(initial),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [type, typeSet] = useState("openai"),
    [name, setName] = useState(""),
    [base, setBase] = useState(types.openai[1]),
    [key, setKey] = useState(""),
    [group, setGroup] = useState(""),
    [edit, setEdit] = useState("");
  const [connection, setConnection] = useState(s.connections[0]?.id || ""),
    [id, setId] = useState(""),
    [effort, setEffort] = useState(""),
    [inPrice, setInPrice] = useState(""),
    [outPrice, setOutPrice] = useState("");
  const [chain, setChain] = useState<Choice[]>(s.config.chain || []),
    [terminal, setTerminal] = useState(!!s.config.terminal),
    [budget, setBudget] = useState(s.config.budget?.toString() || "");
  const c = s.connections.find((x) => x.id === connection),
    m = c?.models.find((x) => x.id === id),
    verified = c?.verified.includes(JSON.stringify([id, effort]));
  const choice = {
    connection,
    id,
    effort,
    inputPrice: inPrice === "" ? null : Number(inPrice),
    outputPrice: outPrice === "" ? null : Number(outPrice),
  };
  async function run(fn: () => Promise<void>, msg: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(msg);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function selectConfig(x?: Connection) {
    setEdit(x?.id || "");
    typeSet(x?.type || "openai");
    setName(x?.name || "");
    setBase(x?.base || types.openai[1]);
    setGroup(x?.group || "");
    setKey("");
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const copy = [...chain];
    copy.splice(to, 0, copy.splice(from, 1)[0]);
    setChain(copy);
  }
  const persist = () =>
    run(
      () =>
        api("settings", {
          chain,
          terminal,
          budget: budget === "" ? null : Number(budget),
        }),
      "Projekteinstellungen gespeichert.",
    );
  return (
    <div className="settings">
      <nav className="modalTabs">
        {[
          ["Anbieter", Cable],
          ["Modelle", Layers3],
          ["Berechtigungen", ShieldCheck],
        ].map(([t, Icon]: any) => (
          <button
            className={tab === t ? "active" : ""}
            key={t}
            onClick={() => {
              setTab(t);
              setNotice("");
              setError("");
            }}
          >
            <Icon size={15} />
            {t}
          </button>
        ))}
      </nav>
      <fieldset disabled={busy}>
        {tab === "Anbieter" ? (
          <>
            <label>
              Verbindung
              <select
                value={edit}
                onChange={(e) =>
                  selectConfig(
                    s.connections.find((x) => x.id === e.target.value),
                  )
                }
              >
                <option value="">Neue Verbindung</option>
                {s.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · verbunden
                  </option>
                ))}
              </select>
            </label>
            <div className="formrow">
              <label>
                Anbieter
                <select
                  value={type}
                  onChange={(e) => {
                    typeSet(e.target.value);
                    setBase(types[e.target.value][1]);
                    setKey("");
                  }}
                >
                  {Object.entries(types).map(([k, [n]]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Verbindungsname
                <input
                  value={name}
                  placeholder={types[type][0]}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
            </div>
            <p>{types[type][2]}</p>
            <label>
              API-Endpunkt
              <input
                disabled={!["compatible", "ollama"].includes(type)}
                value={base}
                onChange={(e) => setBase(e.target.value)}
              />
            </label>
            <label>
              API-Schlüssel
              <input
                autoComplete="off"
                type="password"
                value={key}
                placeholder={
                  edit
                    ? "Gespeicherten Schlüssel weiterverwenden"
                    : "Im Windows-Schlüsselschutz speichern"
                }
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <label>
              Gemeinsames Kontingent
              <input
                value={group}
                placeholder="Standardmäßig gleicher Anbieter-Endpunkt"
                onChange={(e) => setGroup(e.target.value)}
              />
            </label>
            <button
              className="primary"
              onClick={() =>
                run(async () => {
                  const added = await api<Connection>("connect", {
                    id: edit,
                    type,
                    name,
                    base,
                    key,
                    group,
                  });
                  setKey("");
                  setEdit(added.id);
                  setConnection(added.id);
                }, "Verbunden. Modellliste geladen.")
              }
            >
              <PlugZap size={16} />
              Verbindung prüfen und speichern
            </button>
            {edit && (
              <button
                onClick={() =>
                  run(
                    () => api("resetLimit", { id: edit }),
                    "Lokale Kontingentsperre zurückgesetzt.",
                  )
                }
              >
                Kontingent erneut versuchen
              </button>
            )}
          </>
        ) : tab === "Modelle" ? (
          <>
            <p>
              Freigegebene Modelle erhalten Auftrag, relevante Dateien und
              Werkzeugergebnisse dieses Projekts. Die Reihenfolge gilt für
              automatische Übergaben.
            </p>
            <label>
              Verbindung
              <select
                value={connection}
                onChange={(e) => {
                  setConnection(e.target.value);
                  setId("");
                  setEffort("");
                }}
              >
                <option value="">Verbindung wählen</option>
                {s.connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="formrow">
              <label>
                Modell-ID
                <input
                  list="models"
                  value={id}
                  placeholder="Modell wählen oder ID eingeben"
                  onChange={(e) => {
                    setId(e.target.value);
                    setEffort("");
                  }}
                />
                <datalist id="models">
                  {c?.models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                Denkintensität
                <select
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                >
                  <option value="">Standard</option>
                  {m?.efforts?.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="facts">
              <span>
                Modell <b>{m?.name || unavailable}</b>
              </span>
              <span>
                Kontext <b>{m?.context?.toLocaleString("de") || unavailable}</b>
              </span>
              <span>
                Bilder{" "}
                <b>
                  {m?.images == null ? unavailable : m.images ? "Ja" : "Nein"}
                </b>
              </span>
              <span>
                Werkzeuge <b>{verified ? "Geprüft" : "Ungeprüft"}</b>
              </span>
            </div>
            <div className="formrow">
              <label>
                Eingabe · USD / Mio. Token
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    id === "gpt-6-astra" && c?.type === "openai"
                      ? "Katalog: 10"
                      : "Optionaler Schätzpreis"
                  }
                  value={inPrice}
                  onChange={(e) => setInPrice(e.target.value)}
                />
              </label>
              <label>
                Ausgabe · USD / Mio. Token
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder={
                    id === "gpt-6-astra" && c?.type === "openai"
                      ? "Katalog: 50"
                      : "Optionaler Schätzpreis"
                  }
                  value={outPrice}
                  onChange={(e) => setOutPrice(e.target.value)}
                />
              </label>
            </div>
            <div className="buttons">
              <button
                disabled={!id || !c || !s.root}
                onClick={() =>
                  run(
                    () => api("probe", choice),
                    "Werkzeugaufruf erfolgreich geprüft.",
                  )
                }
              >
                <Check size={15} />
                Modell prüfen (API-Anfrage)
              </button>
              <button
                disabled={
                  !verified ||
                  chain.some(
                    (x) =>
                      x.id === id &&
                      x.connection === connection &&
                      x.effort === effort,
                  )
                }
                onClick={() => setChain([...chain, choice])}
              >
                <Plus size={15} />
                Freigeben
              </button>
            </div>
            <h3>Ersatzreihenfolge</h3>
            {chain.length === 0 && <p>Keine Modelle freigegeben.</p>}
            {chain.map((v, i) => (
              <div
                className="order"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData("text/plain", String(i))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  move(Number(e.dataTransfer.getData("text/plain")), i)
                }
                key={i}
              >
                <GripVertical size={14} />
                <span>
                  {i + 1} ·{" "}
                  {s.connections.find((c) => c.id === v.connection)?.name} /{" "}
                  {v.id} {v.effort}
                </span>
                <button
                  title="Nach oben"
                  disabled={!i}
                  onClick={() => move(i, i - 1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  title="Entfernen"
                  onClick={() => setChain(chain.filter((_, j) => i !== j))}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <button className="primary" disabled={!s.root} onClick={persist}>
              Reihenfolge speichern
            </button>
          </>
        ) : (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={terminal}
                onChange={(e) => setTerminal(e.target.checked)}
              />
              Terminalbefehle nach Einzelbestätigung erlauben
            </label>
            <p>
              Dateiwerkzeuge sind auf den Projektordner beschränkt. Bestätigte
              Befehle laufen mit den Rechten Ihres Windows-Kontos und können auf
              Netzwerk und weitere Ordner zugreifen.
            </p>
            <label>
              Projektbudget in USD
              <input
                min="0"
                type="number"
                step="any"
                placeholder="Kein lokales Limit"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </label>
            <p>
              CodeRelay reserviert vor jeder Anfrage einen geschätzten
              Höchstbetrag. Unbekannte Kosten sperren weitere Anfragen bei
              aktivem Limit. Laufende Anfragen können Kosten verursachen.
              Maßgeblich ist die Anbieterabrechnung.
            </p>
            <div className="facts">
              <span>
                Restkontingent <b>{unavailable}</b>
              </span>
              <span>
                Rücksetzzeit <b>{unavailable}</b>
              </span>
            </div>
            <button className="primary" disabled={!s.root} onClick={persist}>
              Berechtigungen speichern
            </button>
          </>
        )}
      </fieldset>
      {busy && <div role="status">Prüfung läuft …</div>}
      {error && (
        <div role="alert" className="warn">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success">
          {notice}
        </div>
      )}
    </div>
  );
}
