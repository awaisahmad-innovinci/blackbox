import Database from "better-sqlite3";
import { sqlitePathFor, readIdentity } from "./identity";
import { runLocalMigrations } from "./migrations";
import { resetStalePushing } from "./outbox-local";

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

const INIT_MAX_ATTEMPTS = 5;
const INIT_BACKOFF_MS = [500, 1000, 1500, 2000, 2000];

let db: Database.Database | null = null;
let dbPath: string | null = null;
let initError: string | null = null;
let lazyRecoveryAttempted = false;

function isSqliteBusy(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: string }).code;
    return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED";
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.includes("database is locked");
}

function sleepMs(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    /* sync wait for init retry */
  }
}

function openLocalDbConnection(path: string): Database.Database {
  const conn = new Database(path);
  conn.pragma("busy_timeout = 5000");
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  return conn;
}

export function getLocalDb(): Database.Database {
  if (db) return db;

  if (!lazyRecoveryAttempted && readIdentity()) {
    lazyRecoveryAttempted = true;
    try {
      return initLocalDb();
    } catch {
      /* fall through to not initialized */
    }
  }

  throw new Error("Local SQLite database is not initialized");
}

/** Open (or create) the local warehouse DB and apply migrations. */
export function initLocalDb(): Database.Database {
  if (db) return db;

  const path = sqlitePathFor(readIdentity());
  dbPath = path;

  let lastErr: unknown;
  for (let attempt = 0; attempt < INIT_MAX_ATTEMPTS; attempt++) {
    let conn: Database.Database | null = null;
    try {
      conn = openLocalDbConnection(path);
      runLocalMigrations(conn);
      try {
        resetStalePushing(conn);
      } catch (err) {
        console.warn("[localDb] resetStalePushing skipped during init:", err);
      }
      db = conn;
      initError = null;
      lazyRecoveryAttempted = false;
      return db;
    } catch (err) {
      lastErr = err;
      if (conn) {
        try {
          conn.close();
        } catch {
          /* ignore close errors during failed init */
        }
      }
      if (isSqliteBusy(err) && attempt < INIT_MAX_ATTEMPTS - 1) {
        sleepMs(INIT_BACKOFF_MS[attempt] ?? 2000);
        continue;
      }
      throw err;
    }
  }

  throw lastErr ?? new Error("Failed to open local SQLite database");
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

export function reopenLocalDb(): Database.Database {
  closeLocalDb();
  lazyRecoveryAttempted = false;
  return initLocalDb();
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
  lazyRecoveryAttempted = false;
}
