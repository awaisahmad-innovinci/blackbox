/**
 * Receipt page box. Must be a valid `size` (two lengths): an invalid one is dropped and the
 * global `@page { size: A4 }` wins, so Chromium lays the slip out on A4 and shrinks it onto the roll.
 * Margin 0 because the slip is already laid out at the full 80mm width.
 */
function receiptPageStyle(heightMicrons: number): string {
  const page = `size: 80mm ${heightMicrons / MICRONS_PER_MM}mm; margin: 0;`;
  return `@media print { @page { ${page} } @page receipt { ${page} } }`;
}

const MICRONS_PER_MM = 1000;
const MICRONS_PER_PX = 25400 / 96;

/** Screen type is 11px. Print type is 14px, so the roll needs a taller page than the on-screen slip. */
function receiptHeightMicrons(slip: Element): number {
  const heightPx = slip.scrollHeight;
  const scaled = Math.ceil(heightPx * (14 / 11) * MICRONS_PER_PX);
  return Math.max(40 * MICRONS_PER_MM, scaled + 8 * MICRONS_PER_MM);
}

/** Print the current page. Sale and return slips use an 80mm page so they are not shrunk onto A4. */
export function printDocument(): void {
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
    void window.blackbox
      .printPage({
        widthMicrons: 80 * MICRONS_PER_MM,
        heightMicrons,
      })
      .finally(cleanup);
    return;
  }

  window.print();
}
