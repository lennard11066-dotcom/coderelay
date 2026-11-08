import { generateMod, example } from "../desktop/fabric.mjs";
import { mkdtemp, readdir, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
await mkdir(".local", { recursive: true });
const parent = await mkdtemp(path.resolve(".local/fabric-"));
const project = await generateMod(parent, {
  name: "Relay HUD",
  id: "relay_hud",
  version: "1.21.1",
  client: true,
  hud: true,
  features: example,
});
const win = process.platform === "win32";
const result = spawnSync(
  win ? "cmd.exe" : "./gradlew",
  win
    ? ["/d", "/c", "gradlew.bat", "build", "--no-daemon"]
    : ["build", "--no-daemon"],
  { cwd: project, stdio: "inherit", windowsHide: true },
);
if (result.status !== 0) process.exit(result.status || 1);
const jar = (await readdir(path.join(project, "build/libs"))).find(
  (f) => f.endsWith(".jar") && !f.endsWith("-sources.jar"),
);
if (!jar) throw Error("Mod-JAR fehlt.");
console.log(
  "Kompiliert:",
  path.join(project, "build/libs", jar),
  "· Spielprüfung offen",
);
