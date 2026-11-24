/**
 * Receipt page box. Must be a valid `size` (two lengths): an invalid one is dropped and the
 * global `@page { size: A4 }` wins, so Chromium lays the slip out on A4 and shrinks it onto the roll.
 * Margins keep the slip inside the head's printable area: 80mm paper prints only the middle 72mm.
 * Windows drivers clip (not scale) anything outside it.
 */
function receiptPageStyle(heightMicrons: number): string {
  const page = `size: 80mm ${heightMicrons / MICRONS_PER_MM}mm; margin: 3mm 4mm;`;
  return `@media print { @page { ${page} } @page receipt { ${page} } }`;
}

const MICRONS_PER_MM = 1000;
const MICRONS_PER_PX = 25400 / 96;

/** Screen type is 11px. Print type is 14px, so the roll needs a taller page than the on-screen slip. */
function receiptHeightMicrons(slip: Element): number {
  const heightPx = slip.scrollHeight;
  const scaled = Math.ceil(heightPx * (14 / 11) * MICRONS_PER_PX);
  return Math.max(40 * MICRONS_PER_MM, scaled + 14 * MICRONS_PER_MM); // 8mm slack + 3mm top/bottom margins
}

/**
 * Print the current page. Sale and return slips use an 80mm page so they are not shrunk onto A4.
 * `silent`: slips go straight to the configured receipt printer (dialog if none is set).
 * Resolves to whether printing succeeded.
 */
export function printDocument(options?: { silent?: boolean }): Promise<boolean> {
  const thermal = document.querySelector("[data-thermal-receipt]");
  const heightMicrons = thermal ? receiptHeightMicrons(thermal) : 0;
  const style = thermal ? document.createElement("style") : null;
  if (style) {
    style.setAttribute("data-print-page", "receipt");
    style.textContent = receiptPageStyle(heightMicrons);
    document.head.appendChild(style);
  }
  const cleanup = () => {
    style?.remove();
  };
  window.addEventListener("afterprint", cleanup, { once: true });

  if (thermal && window.blackbox?.printPage) {
    return window.blackbox
      .printPage({
        // Paper = printable width. Drivers reject wider custom paper (CUPS falls back to Letter →
        // blank roll); the 80mm CSS page is fitted onto it.
        widthMicrons: 72 * MICRONS_PER_MM,
        heightMicrons,
        silent: options?.silent,
      })
      .finally(cleanup);
  }

  window.print();
  return Promise.resolve(true);
}
