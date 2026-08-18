import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "node:path";
import { runLocalMigrations } from "./migrations";

let db: Database.Database | null = null;

export function getLocalDb(): Database.Database {
  if (!db) {
    throw new Error("Local SQLite database is not initialized");
  }
  return db;
}

/** Open (or create) the local warehouse DB and apply migrations. */
export function initLocalDb(): Database.Database {
  if (db) return db;

  const dir = app.getPath("userData");
  const path = join(dir, "blackbox-local.sqlite");
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runLocalMigrations(db);
  return db;
}

export function closeLocalDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
