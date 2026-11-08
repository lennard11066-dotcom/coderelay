import { execFileSync } from "node:child_process";
import { secretPattern } from "../desktop/files.mjs";
const git = (args) => execFileSync("git", args, { maxBuffer: 16e6 });
const files = git(["ls-files", "-z"]).toString().split("\0").filter(Boolean);
const bad = [];
for (const file of files) {
  if (
    /(?:^|\/)(?:node_modules|\.local|dist|release|\.gradle|\.env(?:\..*)?|.*\.sqlite.*|.*\.log|.*\.(?:pem|pfx|key))($|\/)/i.test(
      file,
    ) &&
    file !== ".env.example"
  ) {
    bad.push(file);
    continue;
  }
  const data = git(["show", ":" + file]);
  if (
    !data.includes(0) &&
    (secretPattern.test(data.toString()) ||
      /(?:npm_[a-zA-Z0-9]{32,}|AKIA[A-Z0-9]{16}|xox[baprs]-[\w-]{20,})/.test(
        data.toString(),
      ))
  )
    bad.push(file);
}
if (bad.length) {
  console.error("Index prüfen:", bad.join(", "));
  process.exitCode = 1;
} else
  console.log(
    files.length +
      " vorgesehene Git-Dateien geprüft. Keine Treffer im Zugangsdaten- und Artefaktfilter.",
  );
