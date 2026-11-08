import { safeStorage } from "electron";
import { secretPattern } from "./files.mjs";
export class Vault {
  constructor(store) {
    this.store = store;
  }
  save(id, value) {
    if (!value) {
      this.store.set("secret:" + id, null);
      return;
    }
    if (!safeStorage.isEncryptionAvailable())
      throw Error("Windows-Schlüsselschutz ist nicht verfügbar.");
    this.store.set(
      "secret:" + id,
      safeStorage.encryptString(value).toString("base64"),
    );
  }
  get(id) {
    const cipher = this.store.setting("secret:" + id, null);
    return cipher
      ? safeStorage.decryptString(Buffer.from(cipher, "base64"))
      : "";
  }
  clean(text) {
    let result = String(text);
    for (const row of this.store.all(
      "SELECT id FROM settings WHERE id LIKE 'secret:%'",
    )) {
      const key = this.get(row.id.slice(7));
      if (key) result = result.replaceAll(key, "[geschützt]");
    }
    return result.replace(
      new RegExp(secretPattern.source, "gi"),
      "[geschützt]",
    );
  }
}
