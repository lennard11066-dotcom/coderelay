import React, { useState } from "react";
import { Box, GitBranch } from "lucide-react";
import { api, errorText } from "./types";
export function Fabric({
  example,
  done,
}: {
  example: string;
  done: () => void;
}) {
  const [name, setName] = useState("Relay HUD"),
    [id, setId] = useState("relay_hud"),
    [version, setVersion] = useState("1.21.1"),
    [client, setClient] = useState(true),
    [features, setFeatures] = useState(example),
    [hud, setHud] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("fabric", { name, id, version, client, features, hud });
          done();
        } catch (e) {
          setError(errorText(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="formrow">
        <label>
          Modname
          <input
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Mod-ID
          <input
            value={id}
            pattern="[a-z][a-z0-9_]{1,47}"
            required
            onChange={(e) => setId(e.target.value)}
          />
        </label>
      </div>
      <div className="formrow">
        <label>
          Minecraft Java Edition
          <select
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              if (e.target.value !== "1.21.1") setHud(false);
            }}
          >
            <option>1.21.1</option>
            <option>1.21.8</option>
          </select>
        </label>
        <label>
          Fabric-Modtyp
          <select
            value={client ? "client" : "both"}
            onChange={(e) => setClient(e.target.value === "client")}
          >
            <option value="client">Client-Mod</option>
            <option value="both">Client und Server</option>
          </select>
        </label>
      </div>
      <label>
        Gewünschte Funktionen
        <textarea
          rows={3}
          value={features}
          onChange={(e) => setFeatures(e.target.value)}
        />
      </label>
      <label className="check">
        <input
          checked={hud}
          disabled={version !== "1.21.1"}
          type="checkbox"
          onChange={(e) => setHud(e.target.checked)}
        />
        HUD-Beispielcode einfügen (1.21.1)
      </label>
      <p>
        Der Assistent legt einen neuen Unterordner mit Gradle Wrapper und Fabric
        API an. Gradle benötigt JDK 25. Zielversion für den Modcode ist Java 21.
      </p>
      <button className="primary" disabled={busy}>
        <Box size={15} />
        Zielordner wählen und erstellen
      </button>
      {error && <p className="warn">{error}</p>}
    </form>
  );
}
export function Upload() {
  const [repo, setRepo] = useState(""),
    [visibility, setVisibility] = useState("private"),
    [plan, setPlan] = useState<any>(null),
    [link, setLink] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError("");
    try {
      if (plan) setLink(await api<string>("publish"));
      else setPlan(await api("uploadPreview", { repo, visibility }));
    } catch (e) {
      setError(errorText(e));
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p>
        Ein neuer GitHub-Stand wird aus den geprüften Projektdateien erstellt.
        Die Anmeldung erfolgt über GitHub CLI mit <code>gh auth login</code>.
      </p>
      <label>
        Neues Repository
        <input
          value={repo}
          disabled={busy}
          onChange={(e) => {
            setPlan(null);
            setRepo(e.target.value);
          }}
        />
      </label>
      <label>
        Sichtbarkeit
        <select
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value);
            setPlan(null);
          }}
        >
          <option value="private">Privat</option>
          <option value="public">Öffentlich</option>
        </select>
      </label>
      {plan && (
        <>
          <h3>
            {plan.owner}/{plan.repo} ·{" "}
            {plan.visibility === "private" ? "Privat" : "Öffentlich"}
          </h3>
          <pre>{plan.files.map((x: any) => "+ " + x.file).join("\n")}</pre>
        </>
      )}
      {link ? (
        <div className="success">Remote-Commit geprüft · {link}</div>
      ) : (
        <button disabled={busy || !repo} onClick={go} className="primary">
          <GitBranch size={15} />
          {plan ? "Jetzt veröffentlichen" : "Upload-Vorschau prüfen"}
        </button>
      )}
      {error && <p className="warn">{error}</p>}
    </div>
  );
}
