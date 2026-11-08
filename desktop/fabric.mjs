import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const template = fileURLToPath(new URL("../fabric/template/", import.meta.url));
export const releases = {
  "1.21.1": "0.116.17+1.21.1",
  "1.21.8": "0.136.1+1.21.8",
};
export const example =
  "Erstelle eine Fabric-Mod mit einem verschiebbaren HUD, das Koordinaten und FPS anzeigt.";

export async function generateMod(
  parent,
  { name, id, version, client, features, hud = false },
) {
  if (
    !/^[a-z][a-z0-9_]{1,47}$/.test(id) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(id)
  )
    throw Error("Ungültige Mod-ID.");
  if (!name?.trim() || !Object.hasOwn(releases, version))
    throw Error("Name oder Minecraft-Version ungültig.");
  if (hud && version !== "1.21.1")
    throw Error("Das HUD-Beispiel verwendet Minecraft 1.21.1.");
  const target = path.join(parent, id);
  if (
    await fs.lstat(target).then(
      () => true,
      (e) => {
        if (e.code === "ENOENT") return false;
        throw e;
      },
    )
  )
    throw Error("Zielordner existiert bereits.");
  const staging = path.join(parent, ".coderelay-" + randomUUID());
  await fs.mkdir(staging);
  async function put(file, content) {
    const dest = path.join(staging, file);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content);
  }
  try {
    for (const file of [
      "LICENSE",
      "gradlew",
      "gradlew.bat",
      "gradle/wrapper/gradle-wrapper.jar",
      "gradle/wrapper/gradle-wrapper.properties",
    ]) {
      await put(file, await fs.readFile(path.join(template, file)));
    }
    for (const file of [
      "build.gradle",
      "settings.gradle",
      "gradle.properties",
    ]) {
      const original = await fs.readFile(path.join(template, file), "utf8");
      await put(
        file,
        original
          .replaceAll("modid", id)
          .replace("1.19-SNAPSHOT", "1.19.3")
          .replace("minecraft_version=1.21.1", "minecraft_version=" + version)
          .replace("0.116.17+1.21.1", releases[version])
          .replace("group=com.example", "group=dev.coderelay"),
      );
    }
    const pkg = "dev.coderelay." + id;
    const entry = pkg + ".ModEntry";
    const meta = {
      schemaVersion: 1,
      id,
      version: "${version}",
      name,
      description: features || name,
      environment: client ? "client" : "*",
      entrypoints: client ? { client: [entry] } : { main: [entry] },
      depends: {
        fabricloader: ">=0.20.1",
        minecraft: version,
        java: ">=21",
        "fabric-api": "*",
      },
    };
    await put(
      "src/main/resources/fabric.mod.json",
      JSON.stringify(meta, null, 2),
    );
    await put("src/main/resources/assets/" + id + "/lang/de_de.json", "{}");
    const iface = client ? "ClientModInitializer" : "ModInitializer";
    const method = client ? "onInitializeClient" : "onInitialize";
    const java =
      "package " +
      pkg +
      ";\n\nimport net.fabricmc.api." +
      iface +
      ";\n\npublic class ModEntry implements " +
      iface +
      " {\n    @Override\n    public void " +
      method +
      "() {\n" +
      (hud ? "        Hud.register();\n" : "") +
      "    }\n}\n";
    await put(
      "src/" +
        (client ? "client" : "main") +
        "/java/" +
        pkg.replaceAll(".", "/") +
        "/ModEntry.java",
      java,
    );
    if (hud) {
      let code = await fs.readFile(
        new URL("../fabric/Hud.java.txt", import.meta.url),
        "utf8",
      );
      await put(
        "src/client/java/" + pkg.replaceAll(".", "/") + "/Hud.java",
        code.replace("PACKAGE_NAME", pkg).replace("MOD_ID", id),
      );
      if (!client) {
        meta.entrypoints.client = [pkg + ".Hud"];
        await put(
          "src/main/resources/fabric.mod.json",
          JSON.stringify(meta, null, 2),
        );
        await put(
          "src/main/java/" + pkg.replaceAll(".", "/") + "/ModEntry.java",
          java.replace("        Hud.register();\n", ""),
        );
      }
    }
    await put(
      "README.md",
      "# " +
        name +
        "\n\n" +
        (features || "") +
        "\n\nJDK 25 für Gradle verwenden (Java-Zielversion 21). Mit gradlew.bat build bauen. Die Mod-JAR aus build/libs (ohne -sources) zusammen mit Fabric API " +
        releases[version] +
        " in den mods-Ordner einer Fabric-Loader-Installation für Minecraft " +
        version +
        " legen. Entwicklungsclient: gradlew.bat runClient.\n" +
        (hud
          ? "Im Spiel Chat öffnen und das HUD mit gedrückter linker Maustaste verschieben. Die Position wird beim Loslassen gespeichert.\n"
          : ""),
    );
    await put(".gitignore", ".gradle/\nbuild/\nrun/\n.idea/\n");
    await fs.chmod(path.join(staging, "gradlew"), 0o755);
    await fs.rename(staging, target);
    return target;
  } catch (e) {
    await fs.rm(staging, { force: true, recursive: true });
    throw e;
  }
}
