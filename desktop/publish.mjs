import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ignore from "ignore";
import { digest, safePath, prohibited, secretPattern } from "./files.mjs";
const exec = promisify(execFile);
async function cli(cmd, args, cwd) {
  try {
    return (
      await exec(cmd, args, {
        cwd,
        windowsHide: true,
        maxBuffer: 8e6,
        env: {
          ...process.env,
          GH_PROMPT_DISABLED: "1",
          GIT_TERMINAL_PROMPT: "0",
        },
      })
    ).stdout.trim();
  } catch (e) {
    throw Error(
      e.code === "ENOENT"
        ? cmd +
            " fehlt. Bitte installieren und gegebenenfalls gh auth login ausführen."
        : (e.stderr || e.message).slice(-1200),
    );
  }
}
export async function manifest(root, clean = (s) => s) {
  const result = [];
  async function visit(dir, parents = []) {
    const file = path.posix.join(dir, ".gitignore");
    const rules = [...parents];
    try {
      const spec = await fs.readFile(safePath(root, file), "utf8");
      rules.push({ dir, filter: ignore().add(spec) });
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    for (const entry of await fs.readdir(path.join(root, dir), {
      withFileTypes: true,
    })) {
      if (
        entry.isSymbolicLink() ||
        prohibited(entry.name) ||
        /^(?:dist|build|release|out|coverage|run|target|\.cache|\.vscode)$/i.test(
          entry.name,
        )
      )
        continue;
      const rel = path.posix.join(dir, entry.name);
      const full = safePath(root, rel);
      if (
        rules.some((rule) =>
          rule.filter.ignores(
            path.posix.relative(rule.dir, rel) +
              (entry.isDirectory() ? "/" : ""),
          ),
        )
      )
        continue;
      if (entry.isDirectory()) {
        await visit(rel, rules);
        continue;
      }
      if (
        !entry.isFile() ||
        (/\.(?:jar|exe|zip|dll|bin|log|class|pyc|keystore|sqlite.*|db.*)$/i.test(
          rel,
        ) &&
          rel !== "gradle/wrapper/gradle-wrapper.jar")
      )
        continue;
      const stat = await fs.stat(full);
      if (stat.size > 2e6)
        throw Error("Datei zu groß für den geprüften Upload: " + rel);
      const data = await fs.readFile(full);
      if (
        data.includes(0) &&
        !(
          /\.(png|ico|jpe?g|woff2?)$/i.test(rel) ||
          rel === "gradle/wrapper/gradle-wrapper.jar"
        )
      )
        continue;
      const content = data.toString("utf8");
      if (secretPattern.test(content) || clean(content) !== content)
        throw Error("Mögliche Zugangsdaten in " + rel);
      result.push({ file: rel, hash: digest(data) });
      if (result.length > 3000)
        throw Error("Projekt enthält zu viele Dateien.");
    }
  }
  await visit("");
  return result.sort((a, b) => a.file.localeCompare(b.file));
}
export async function previewUpload(root, repo, visibility, clean) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,90}$/.test(repo) ||
    !["private", "public"].includes(visibility)
  )
    throw Error("Repositoryname oder Sichtbarkeit ungültig.");
  const owner = await cli(
    "gh",
    ["api", "--hostname", "github.com", "user", "--jq", ".login"],
    root,
  );
  const files = await manifest(root, clean);
  if (!files.length) throw Error("Keine veröffentlichbaren Dateien.");
  return { owner, repo, visibility, files, root };
}
export async function publish(plan, clean) {
  const current = await previewUpload(
    plan.root,
    plan.repo,
    plan.visibility,
    clean,
  );
  if (JSON.stringify(current) !== JSON.stringify(plan))
    throw Error("Projekt oder Zielkonto geändert. Vorschau erneut öffnen.");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "coderelay-upload-"));
  try {
    for (const { file, hash } of plan.files) {
      const data = await fs.readFile(safePath(plan.root, file));
      if (digest(data) !== hash) throw Error("Datei geändert: " + file);
      await fs.mkdir(path.dirname(path.join(tmp, file)), { recursive: true });
      await fs.writeFile(path.join(tmp, file), data);
    }
    await cli("git", ["init", "-b", "main"], tmp);
    await cli("git", ["add", "-f", "--", "."], tmp);
    await cli(
      "git",
      [
        "-c",
        "user.name=" + plan.owner,
        "-c",
        "user.email=" + plan.owner + "@users.noreply.github.com",
        "commit",
        "-m",
        "Projekt mit CodeRelay veröffentlichen",
      ],
      tmp,
    );
    const target = plan.owner + "/" + plan.repo;
    await cli(
      "gh",
      [
        "repo",
        "create",
        "github.com/" + target,
        "--" + plan.visibility,
        "--source",
        ".",
        "--remote",
        "origin",
        "--push",
      ],
      tmp,
    );
    const head = await cli("git", ["rev-parse", "HEAD"], tmp);
    const remote = await cli(
      "gh",
      [
        "api",
        "--hostname",
        "github.com",
        "repos/" + target + "/commits/main",
        "--jq",
        ".sha",
      ],
      tmp,
    );
    if (head !== remote)
      throw Error("Remote-Commit konnte nicht bestätigt werden.");
    return "https://github.com/" + target;
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}
