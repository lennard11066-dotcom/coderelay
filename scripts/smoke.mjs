import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { _electron as electron } from "playwright-core";
import { Store } from "../desktop/store.mjs";
import { verifyHandoff } from "../tests/simulated-desktop.mjs";
const require = createRequire(import.meta.url);
fs.mkdirSync(".local", { recursive: true });
const dir = fs.mkdtempSync(path.resolve(".local/desktop-test-"));
const profile = path.join(dir, "profile"),
  project = path.join(dir, "Beispiel");
fs.mkdirSync(profile);
fs.mkdirSync(project);
fs.writeFileSync(path.join(project, "start.py"), 'print("Hallo")\n');
const db = new Store(path.join(profile, "workspace.sqlite"));
db.project(project);
db.set("current", project);
db.close();
const packaged = process.argv.includes("--packaged");
const app = await electron.launch({
  executablePath: packaged
    ? path.resolve("release/win-unpacked/CodeRelay.exe")
    : require("electron"),
  args: [...(packaged ? [] : ["."]), "--user-data-dir=" + profile],
  timeout: 45000,
});
const problems = [];
try {
  const page = await app.firstWindow({ timeout: 30000 });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(msg.text());
  });
  await page.getByRole("heading", { name: "Beispiel", exact: true }).waitFor();
  await page.screenshot({ path: path.join(dir, "arbeitsbereich.png") });
  await page
    .getByRole("button", { name: "Einstellungen", exact: true })
    .click();
  await page.getByRole("dialog").waitFor();
  await page
    .getByRole("button", { name: "Berechtigungen", exact: true })
    .last()
    .click();
  await page
    .getByLabel("Terminalbefehle nach Einzelbestätigung erlauben")
    .check();
  await page.getByRole("button", { name: "Berechtigungen speichern" }).click();
  await page
    .getByText("Projekteinstellungen gespeichert.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "start.py", exact: true }).click();
  const editor = page.locator(".monaco-editor textarea").first();
  await editor.waitFor();
  await editor.focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText("# Test");
  await page.keyboard.press("Control+s");
  await page.waitForFunction(
    () => !document.querySelector(".docTab")?.textContent?.includes("●"),
    {},
    { timeout: 5000 },
  );
  assert.match(
    fs.readFileSync(path.join(project, "start.py"), "utf8"),
    /# Test/,
  );
  const secretCheck = await app.evaluate(({ safeStorage }) => {
    const sample = "simulierter Tresortest";
    const cipher = safeStorage.encryptString(sample);
    return (
      !cipher.toString("utf8").includes(sample) &&
      safeStorage.decryptString(cipher) === sample
    );
  });
  assert.equal(secretCheck, true);
  const status = await page.evaluate(() => window.relay.call("state"));
  assert.equal(status.config.terminal, true);
  assert.equal(status.actions.at(-1).kind, "write");
  await verifyHandoff(page, project, profile);
  await page.getByRole("button", { name: "Übersicht", exact: true }).click();
  await app.evaluate(({ dialog }, parent) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [parent],
    });
  }, dir);
  await page
    .getByRole("button", { name: "Fabric-Mod erstellen", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Zielordner wählen und erstellen" })
    .click();
  await Promise.race([
    page.getByRole("heading", { name: "relay_hud", exact: true }).waitFor(),
    page
      .locator(".modal .warn")
      .waitFor()
      .then(async () => {
        throw Error(await page.locator(".modal .warn").innerText());
      }),
  ]);
  assert.equal(
    fs
      .readFileSync(
        path.join(dir, "relay_hud/gradle/wrapper/gradle-wrapper.jar"),
      )
      .compare(
        fs.readFileSync("fabric/template/gradle/wrapper/gradle-wrapper.jar"),
      ),
    0,
  );
  assert.deepEqual(problems, []);
  console.log(
    "Desktop geprüft: Projektwiederherstellung, deutscher Arbeitsbereich, Freigaben, Monaco, Speichern, SQLite und Windows-Schlüsselschutz.",
    dir,
  );
} finally {
  await app.close();
}
