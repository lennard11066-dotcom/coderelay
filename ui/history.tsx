import React, { useEffect, useState } from "react";
import { api, Action, errorText } from "./types";
export function History({
  id,
  actions,
  root,
}: {
  id?: string;
  actions: Action[];
  root: string;
}) {
  const [git, setGit] = useState<{ branch: string; status: string } | null>(
      null,
    ),
    [err, setErr] = useState(""),
    [files, setFiles] = useState<string[]>([]),
    [point, setPoint] = useState(""),
    [file, setFile] = useState("");
  const commands = actions.filter((a) => ["run", "preview"].includes(a.kind));
  useEffect(() => {
    setPoint("");
    setFile("");
    setFiles([]);
  }, [id, root]);
  useEffect(() => {
    let active = true;
    if (root)
      api<typeof git>("git")
        .then((v) => {
          if (active) setGit(v);
        })
        .catch((e) => setErr(errorText(e)));
    return () => {
      active = false;
    };
  }, [root, actions.length]);
  async function choose(p: string) {
    setPoint(p);
    setFile("");
    setFiles([]);
    if (!p) return;
    try {
      setFiles(await api<string[]>("checkpoint", { id: p }));
    } catch (e) {
      setErr(errorText(e));
    }
  }
  return (
    <div>
      {git && (
        <details>
          <summary>Git · {git.branch}</summary>
          <pre>{git.status || "Arbeitsverzeichnis sauber."}</pre>
        </details>
      )}
      {commands.length > 0 && (
        <details>
          <summary>Wiederherstellungspunkte vor Terminalbefehlen</summary>
          <select
            aria-label="Wiederherstellungspunkt"
            value={point}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Befehl wählen</option>
            {commands.map((a, i) => (
              <option key={a.id} value={a.id}>
                {i + 1} · {a.args.text}
              </option>
            ))}
          </select>
          <select
            aria-label="Datei wiederherstellen"
            value={file}
            onChange={(e) => setFile(e.target.value)}
          >
            <option value="">Datei wählen</option>
            {files.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <button
            disabled={!file}
            onClick={async () => {
              try {
                await api("recoverFile", { id: point, path: file });
              } catch (e) {
                setErr(errorText(e));
              }
            }}
          >
            Früheren Inhalt wiederherstellen
          </button>
        </details>
      )}
      {err && <p role="alert">{err}</p>}
    </div>
  );
}
