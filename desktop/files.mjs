import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createTwoFilesPatch } from "diff";

export const maxFile = 1024 * 1024;
const denied =
  /^(?:\.git|\.hg|\.svn|\.env(?:\..*)?|\.ssh|\.aws|\.gnupg|\.codex|\.agents|\.npmrc|\.netrc|\.pypirc|\.local|node_modules|\.gradle|\.idea|\.venv|__pycache__|\.DS_Store|.*\.(?:pem|p12|pfx|key|sqlite3?|db)(?:-.*)?|credentials(?:\..*)?|secrets?(?:\..*)?|id_(?:rsa|ed25519).*|.*\.jks)$/i;
export const secretPattern =
  /(?:-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|(?:sk-(?:ant-|proj-)?|gh[pousr]_|github_pat_|AIza)[A-Za-z0-9_-]{16,}|(?:api[_-]?key|access[_-]?token|password|client[_-]?secret)\s*[:=]\s*["'][^"'\s]{8,}["'])/i;
export function prohibited(name) {
  return denied.test(name);
}
export function safePath(root, relative = "") {
  if (
    typeof relative !== "string" ||
    relative.length > 1024 ||
    path.isAbsolute(relative) ||
    /[\x00-\x1f:*?"<>|]/.test(relative)
  )
    throw Error("Unzulässiger Projektpfad.");
  let current = fs.realpathSync(root);
  if (path.relative(root, current) !== "")
    throw Error("Projektordner wurde durch eine Verknüpfung ersetzt.");
  for (const part of relative.split(/[\\/]/).filter(Boolean)) {
    if (part === ".") continue;
    if (
      part === ".." ||
      prohibited(part) ||
      /[ .]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)
    )
      throw Error("Geschützter oder ungültiger Pfad: " + part);
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink > 1))
      throw Error("Verknüpfungen sind für Dateiwerkzeuge gesperrt.");
    if (stat && !stat.isDirectory() && !stat.isFile())
      throw Error("Kein regulärer Projekteinhalt.");
  }
  return current;
}
export function readText(root, file) {
  const resolved = safePath(root, file);
  if (fs.statSync(resolved).size > maxFile)
    throw Error("Datei größer als 1 MiB.");
  const bytes = fs.readFileSync(resolved);
  if (bytes.includes(0)) throw Error("Binärdatei.");
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (secretPattern.test(value))
    throw Error("Datei enthält mögliche Zugangsdaten.");
  return value;
}
export function list(root, dir = "") {
  return fs
    .readdirSync(safePath(root, dir), { withFileTypes: true })
    .filter(
      (x) =>
        !prohibited(x.name) &&
        !x.isSymbolicLink() &&
        (x.isFile() || x.isDirectory()),
    )
    .map((x) => ({
      name: x.name,
      path: path.posix.join(dir.replaceAll("\\", "/"), x.name),
      folder: x.isDirectory(),
    }))
    .sort(
      (a, b) =>
        Number(b.folder) - Number(a.folder) ||
        a.name.localeCompare(b.name, "de"),
    )
    .slice(0, 1000);
}
export function write(root, file, before, after) {
  const dest = safePath(root, file);
  const actual = fs.existsSync(dest) ? readText(root, file) : null;
  if (actual !== before)
    throw Error("Datei wurde zwischenzeitlich geändert. Bitte erneut lesen.");
  if (
    typeof after !== "string" ||
    Buffer.byteLength(after) > maxFile ||
    secretPattern.test(after)
  )
    throw Error("Inhalt zu groß oder enthält mögliche Zugangsdaten.");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const tmp = path.join(path.dirname(dest), ".relay-" + randomUUID() + ".tmp");
  try {
    fs.writeFileSync(tmp, after, { flag: "wx" });
    fs.renameSync(tmp, dest);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}
export function diff(file, before, after) {
  return createTwoFilesPatch(
    file,
    file,
    before ?? "",
    after ?? "",
    "vorher",
    "nachher",
  );
}
export function digest(data) {
  return createHash("sha256").update(data).digest("hex");
}
export function restore(root, action) {
  if (action.kind !== "write" || action.status !== "done")
    throw Error("Kein wiederherstellbarer Schreibvorgang.");
  if (
    readText(root, action.argsPath ?? JSON.parse(action.args).path) !==
    action.afterText
  )
    throw Error("Die Datei hat weitere Änderungen.");
  const file = JSON.parse(action.args).path;
  if (action.beforeText === null) fs.unlinkSync(safePath(root, file));
  else write(root, file, action.afterText, action.beforeText);
}
