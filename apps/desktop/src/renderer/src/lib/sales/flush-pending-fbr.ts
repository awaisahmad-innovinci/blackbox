import { submitPostedSaleToFbr } from "./submit-fbr";

let running = false;

/** Submit locally pending FBR bills one at a time. Stops if the network drops. */
export async function flushPendingFbrSales(): Promise<void> {
  if (running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const list = window.blackbox?.localDb?.listPendingFbrSales;
  if (!list) return;

  running = true;
  try {
    const pending = await list();
    for (const sale of pending) {
      if (typeof navigator !== "undefined" && navigator.onLine === false) break;
      const updated = await submitPostedSaleToFbr(sale);
      if (updated.fbrStatus === "pending") break;
    }
  } finally {
    running = false;
  }
}
