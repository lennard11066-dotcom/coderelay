import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { manifest } from "../desktop/publish.mjs";
test("Upload-Vorschau filtert Geheimnisse, Nutzerdaten und Git-Ignore-Regeln", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "relay-export-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [file, text] of [
    ["main.py", "pass"],
    [".gitignore", "privat/"],
    [".env", "DUMMY"],
    ["workspace.sqlite", "fixture"],
    ["privat/chat.txt", "Privat"],
    ["src/.gitignore", "ignored.py"],
    ["src/ignored.py", "pass"],
  ]) {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await fs.writeFile(path.join(root, file), text);
  }
  const files = (await manifest(root)).map((x) => x.file);
  assert.deepEqual(files, [".gitignore", "main.py", "src/.gitignore"]);
  await fs.writeFile(path.join(root, "main.py"), "individuelles-geheimnis");
  await assert.rejects(
    manifest(root, (value) =>
      value.replace("individuelles-geheimnis", "[geschützt]"),
    ),
    /Zugangsdaten/,
  );
});
