/** In-memory bill stash while navigating away from New sale (per cashier). */
export type OpenSaleStash = {
  userId: string;
  customerName: string;
  warehouseId: string;
  lines: unknown[];
  payments: unknown[];
  paymentMode: string;
};

let stashedNewSale: OpenSaleStash | null = null;

export function stashOpenSale(snapshot: OpenSaleStash): void {
  stashedNewSale = snapshot;
}

export function takeOpenSaleStash(
  userId: string | null | undefined,
): OpenSaleStash | null {
  if (!userId || !stashedNewSale || stashedNewSale.userId !== userId) {
    return null;
  }
  const taken = stashedNewSale;
  stashedNewSale = null;
  return taken;
}

export function clearStashedNewSale(): void {
  stashedNewSale = null;
}