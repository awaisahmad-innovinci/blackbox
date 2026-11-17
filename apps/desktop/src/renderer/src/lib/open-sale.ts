const CASHIER_OPEN_SALE_KEY_LEGACY = "cashier_open_sale_id";

function openSaleMetaKey(userId: string): string {
  return `cashier_open_sale_id:${userId}`;
}

export async function readOpenSaleId(
  userId: string | null | undefined,
): Promise<string | null> {
  if (!userId) return null;
  const scoped = await window.blackbox?.localDb?.getSyncMeta?.(
    openSaleMetaKey(userId),
  );
  const scopedId = scoped?.trim() ?? "";
  if (scopedId) return scopedId;

  const legacy = await window.blackbox?.localDb?.getSyncMeta?.(
    CASHIER_OPEN_SALE_KEY_LEGACY,
  );
  const legacyId = legacy?.trim() ?? "";
  return legacyId || null;
}

export async function writeOpenSaleId(
  userId: string | null | undefined,
  id: string | null,
): Promise<void> {
  if (!userId) return;
  await window.blackbox?.localDb?.setSyncMeta?.(
    openSaleMetaKey(userId),
    id ?? "",
  );
  if (id) {
    await window.blackbox?.localDb?.setSyncMeta?.(
      CASHIER_OPEN_SALE_KEY_LEGACY,
      "",
    );
  }
}

/** Clears per-user open-sale pointer and removes the auto-saved DRAFT row. */
export async function clearCashierOpenSaleState(
  userId: string,
): Promise<void> {
  const id = await readOpenSaleId(userId);
  if (id) {
    try {
      await window.blackbox?.localDb?.deleteSaleDraft?.(id);
    } catch {
      /* best-effort */
    }
  }
  await writeOpenSaleId(userId, null);
  await window.blackbox?.localDb?.setSyncMeta?.(
    CASHIER_OPEN_SALE_KEY_LEGACY,
    "",
  );
}