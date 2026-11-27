import {
  SYNC_CASH_LEDGER_SECTIONS,
  SYNC_CATALOG_PAGE_SIZE,
  type SyncCashLedgerBootstrapItem,
  type SyncCashLedgerSection,
  type SyncChangeDto,
} from "@blackbox/shared";
import { getApiErrorMessage } from "@renderer/lib/api/client";
import { syncApi } from "@renderer/lib/api/sync";

const SECTION_LABEL: Record<SyncCashLedgerSection, string> = {
  owner_cash: "owner cash",
  manager_drawer_openings: "manager drawer openings",
  manager_drawer_submissions: "manager drawer submissions",
  cash_expenses: "cash expenses",
  till_sessions: "till sessions",
  till_withdrawals: "till withdrawals",
};

const PRELOAD_RESTART_MESSAGE =
  "Restart the desktop app to finish restore (preload update required).";

export type CashLedgerProgress = {
  section: SyncCashLedgerSection;
  done: number;
  total: number;
  message: string;
};

export class CashLedgerPullError extends Error {
  constructor(
    readonly section: SyncCashLedgerSection,
    message: string,
  ) {
    super(message);
    this.name = "CashLedgerPullError";
  }
}

async function applyBootstrapItems(
  items: SyncCashLedgerBootstrapItem[],
): Promise<void> {
  if (items.length === 0) return;
  const sync = window.blackbox?.sync;
  if (!sync) {
    throw new CashLedgerPullError("owner_cash", PRELOAD_RESTART_MESSAGE);
  }

  if (sync.applyCashLedgerBootstrap) {
    await sync.applyCashLedgerBootstrap(items);
    return;
  }

  if (sync.applyPull) {
    const createdAt = new Date().toISOString();
    const changes: SyncChangeDto[] = items.map((item) => ({
      seq: "0",
      changeId: "bootstrap",
      originDeviceId: "",
      stream: "purchasing",
      entityType: item.entityType,
      entityId: item.entityId,
      operation: "UPSERT",
      entityVersion: 0,
      payload: item.payload,
      createdAt,
    }));
    await sync.applyPull({
      bootstrapOnly: true,
      stream: "purchasing",
      nextCursor: "0",
      changes,
    });
    return;
  }

  throw new CashLedgerPullError("owner_cash", PRELOAD_RESTART_MESSAGE);
}

export async function runCashLedgerBootstrap(
  onProgress?: (progress: CashLedgerProgress) => void,
): Promise<void> {
  for (const section of SYNC_CASH_LEDGER_SECTIONS) {
    let page = 1;
    let total = 0;
    let done = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const result = await syncApi.cashLedger(section, page, SYNC_CATALOG_PAGE_SIZE);
        if (page === 1) total = result.total;
        if (result.items.length > 0) {
          await applyBootstrapItems(result.items);
        }
        done += result.items.length;
        hasMore = result.hasMore;
        page += 1;

        const label = SECTION_LABEL[section];
        onProgress?.({
          section,
          done,
          total: Math.max(total, done),
          message:
            total > 0
              ? `Syncing ${label}… ${done}/${total}`
              : `Syncing ${label}…`,
        });
      } catch (err: unknown) {
        if (err instanceof CashLedgerPullError) throw err;
        throw new CashLedgerPullError(
          section,
          getApiErrorMessage(err, `Failed to sync ${SECTION_LABEL[section]}`),
        );
      }
    }
  }

  onProgress?.({
    section: "till_withdrawals",
    done: 1,
    total: 1,
    message: "Cash ledger saved",
  });
}