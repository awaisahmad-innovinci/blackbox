import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "node:path";
import { runLocalMigrations } from "./migrations";

export type LocalDbStatus =
  | {
      connected: true;
      path: string;
      migrationsApplied: number;
      latestMigration: string | null;
    }
  | {
      connected: false;
      path: string | null;
      error: string;
    };

let db: Database.Database | null = null;
let dbPath: string | null = null;
let initError: string | null = null;

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
  dbPath = path;
  db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runLocalMigrations(db);
  initError = null;
  return db;
}

/** Lightweight probe for the renderer status banner. */
export function getLocalDbStatus(): LocalDbStatus {
  if (!db) {
    return {
      connected: false,
      path: dbPath,
      error: initError ?? "Local SQLite database is not initialized",
    };
  }

  try {
    db.prepare("SELECT 1").get();
    const row = db
      .prepare(
        "SELECT COUNT(*) AS applied, MAX(id) AS latest FROM schema_migrations",
      )
      .get() as { applied: number; latest: string | null };
    return {
      connected: true,
      path: dbPath ?? "",
      migrationsApplied: Number(row.applied) || 0,
      latestMigration: row.latest,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Local database probe failed";
    return {
      connected: false,
      path: dbPath,
      error: message,
    };
  }
}

export function closeLocalDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export function recordLocalDbInitError(err: unknown): void {
  initError =
    err instanceof Error ? err.message : "Failed to open local SQLite database";
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore close errors during failed init */
    }
  }
  db = null;
}
