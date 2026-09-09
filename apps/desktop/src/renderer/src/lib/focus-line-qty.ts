export function focusLineQty(productSkuId: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>(
      `[data-sku-qty="${productSkuId}"]`,
    );
    el?.focus();
    el?.select();
  });
}
