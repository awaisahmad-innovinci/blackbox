import { getLocalDb } from "./index";

function nowIso(): string {
  return new Date().toISOString();
}

export function getSyncMeta(key: string): string | null {
  const db = getLocalDb();
  const row = db
    .prepare("select value from sync_meta where key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSyncMeta(key: string, value: string): void {
  const db = getLocalDb();
  const ts = nowIso();
  db.prepare(
    `insert into sync_meta (key, value, updated_at)
     values (@key, @value, @updatedAt)
     on conflict(key) do update set
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run({ key, value, updatedAt: ts });
}
