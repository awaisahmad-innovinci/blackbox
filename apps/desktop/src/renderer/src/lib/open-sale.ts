const CASHIER_OPEN_SALE_KEY = "cashier_open_sale_id";

export async function readOpenSaleId(): Promise<string | null> {
  const value = await window.blackbox?.localDb?.getSyncMeta?.(CASHIER_OPEN_SALE_KEY);
  const id = value?.trim() ?? "";
  return id || null;
}

export async function writeOpenSaleId(id: string | null): Promise<void> {
  await window.blackbox?.localDb?.setSyncMeta?.(CASHIER_OPEN_SALE_KEY, id ?? "");
}
