import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { safePath, prohibited, readText, maxFile, write } from "./files.mjs";

export function gitState(root) {
  const git = (args) =>
    execFileSync(
      "git",
      [
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-C",
        root,
        ...args,
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 8000,
        maxBuffer: 2e6,
      },
    ).trimEnd();
  try {
    if (git(["rev-parse", "--is-inside-work-tree"]) !== "true") return null;
    return {
      branch: git(["rev-parse", "--abbrev-ref", "HEAD"]) || "HEAD",
      status: git(["status", "--porcelain", "--untracked-files=normal"]).slice(
        0,
        32000,
      ),
    };
  } catch {
    return null;
  }
}
export function checkpoint(root, clean) {
  const files = {};
  let size = 0;
  function visit(dir) {
    for (const ent of fs.readdirSync(safePath(root, dir), {
      withFileTypes: true,
    })) {
      if (
        ent.isSymbolicLink() ||
        prohibited(ent.name) ||
        ["build", "dist", "release", "target", "run", "out", ".cache"].includes(
          ent.name,
        )
      )
        continue;
      const file = path.posix.join(dir, ent.name);
      if (ent.isDirectory()) {
        visit(file);
        continue;
      }
      if (!ent.isFile()) continue;
      let text;
      try {
        if (fs.statSync(safePath(root, file)).size > maxFile) continue;
        text = readText(root, file);
      } catch {
        continue;
      }
      if (clean(text) !== text) continue;
      size += Buffer.byteLength(text);
      if (size > 16e6)
        throw Error(
          "Projekt zu groß für einen Terminal-Wiederherstellungspunkt (16 MB Text).",
        );
      files[file] = text;
    }
  }
  visit("");
  return files;
}
export function recoverCheckpoint(root, files, file) {
  if (!Object.hasOwn(files, file))
    throw Error("Datei fehlt im Wiederherstellungspunkt.");
  const current = fs.existsSync(safePath(root, file))
    ? readText(root, file)
    : null;
  write(root, file, current, files[file]);
}
