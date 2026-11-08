import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

export class Store {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    const version = this.one("PRAGMA user_version").user_version;
    if (version > 2)
      throw Error("Die Datenbank benötigt eine neuere App-Version.");
    if (!version)
      this.db.exec(
        "BEGIN;" +
          readFileSync(new URL("./schema/001.sql", import.meta.url), "utf8") +
          "COMMIT;",
      );
    if (version < 2)
      this.db.exec(
        "BEGIN;" +
          readFileSync(new URL("./schema/002.sql", import.meta.url), "utf8") +
          "COMMIT;",
      );
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
  one(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  setting(id, fallback) {
    const row = this.one("SELECT value FROM settings WHERE id=?", id);
    return row ? JSON.parse(row.value) : fallback;
  }
  set(id, value) {
    this.run(
      "INSERT OR REPLACE INTO settings VALUES(?,?)",
      id,
      JSON.stringify(value),
    );
  }
  project(root) {
    this.run(
      "INSERT INTO projects(root,touched) VALUES(?,?) ON CONFLICT(root) DO UPDATE SET touched=excluded.touched",
      root,
      Date.now(),
    );
  }
  config(root) {
    return JSON.parse(
      this.one("SELECT config FROM projects WHERE root=?", root)?.config ||
        "{}",
    );
  }
  configure(root, config) {
    this.run(
      "UPDATE projects SET config=? WHERE root=?",
      JSON.stringify(config),
      root,
    );
  }
  task(root, prompt) {
    const id = randomUUID();
    this.run(
      "INSERT INTO tasks(id,root,prompt,status,created) VALUES(?,?,?,?,?)",
      id,
      root,
      prompt,
      "pausiert",
      Date.now(),
    );
    return id;
  }
  event(task, kind, body) {
    this.run(
      "INSERT INTO events(task,kind,body,at) VALUES(?,?,?,?)",
      task,
      kind,
      body,
      Date.now(),
    );
  }
  status(id, status) {
    this.run("UPDATE tasks SET status=? WHERE id=?", status, id);
  }
  close() {
    this.db.close();
  }
}
