import { readIdentity } from "./identity";
import { getLocalDb } from "./index";

export type SupervisorTotpRow = {
  userId: string;
  secretBase32: string;
  displayName: string;
  isManager: boolean;
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
      insert into supervisor_totp (user_id, tenant_id, secret_base32, display_name, is_manager, updated_at)
      values (@userId, @tenantId, @secretBase32, @displayName, @isManager, datetime('now'))
    `);
    for (const entry of entries) {
      insert.run({
        userId: entry.userId,
        tenantId: identity.tenantId,
        secretBase32: entry.secretBase32,
        displayName: entry.displayName,
        isManager: entry.isManager ? 1 : 0,
      });
    }
  });
  run();
}

export function getSupervisorTotpSecretsLocal(): SupervisorTotpRow[] {
  const identity = readIdentity();
  if (!identity?.tenantId) return [];

  const db = getLocalDb();
  const rows = db
    .prepare(
      `select user_id as userId, secret_base32 as secretBase32,
              coalesce(display_name, '') as displayName,
              coalesce(is_manager, 0) as isManager
       from supervisor_totp
       where tenant_id = ?`,
    )
    .all(identity.tenantId) as Array<{
    userId: string;
    secretBase32: string;
    displayName: string;
    isManager: number;
  }>;
  return rows.map((row) => ({
    userId: row.userId,
    secretBase32: row.secretBase32,
    displayName: row.displayName,
    isManager: row.isManager === 1,
  }));
}

export function listSupervisorTotpUsersLocal(): string[] {
  return getSupervisorTotpSecretsLocal().map((row) => row.userId);
}

export function hasSupervisorTotpLocal(): boolean {
  return getSupervisorTotpSecretsLocal().length > 0;
}
