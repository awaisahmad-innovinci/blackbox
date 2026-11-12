import { readIdentity } from "./identity";
import { getLocalDb } from "./index";

export type SupervisorTotpRow = {
  userId: string;
  secretBase32: string;
  displayName: string;
};

export function replaceSupervisorTotpLocal(
  entries: SupervisorTotpRow[],
): void {
  const identity = readIdentity();
  if (!identity?.tenantId) return;

  const db = getLocalDb();
  const run = db.transaction(() => {
    db.prepare("delete from supervisor_totp where tenant_id = ?").run(
      identity.tenantId,
    );
    const insert = db.prepare(`
      insert into supervisor_totp (user_id, tenant_id, secret_base32, display_name, updated_at)
      values (@userId, @tenantId, @secretBase32, @displayName, datetime('now'))
    `);
    for (const entry of entries) {
      insert.run({
        userId: entry.userId,
        tenantId: identity.tenantId,
        secretBase32: entry.secretBase32,
        displayName: entry.displayName,
      });
    }
  });
  run();
}

export function getSupervisorTotpSecretsLocal(): SupervisorTotpRow[] {
  const identity = readIdentity();
  if (!identity?.tenantId) return [];

  const db = getLocalDb();
  return db
    .prepare(
      `select user_id as userId, secret_base32 as secretBase32,
              coalesce(display_name, '') as displayName
       from supervisor_totp
       where tenant_id = ?`,
    )
    .all(identity.tenantId) as SupervisorTotpRow[];
}

export function listSupervisorTotpUsersLocal(): string[] {
  return getSupervisorTotpSecretsLocal().map((row) => row.userId);
}

export function hasSupervisorTotpLocal(): boolean {
  return getSupervisorTotpSecretsLocal().length > 0;
}
