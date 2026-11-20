const RECEIPT_PAGE_STYLE = `
@media print {
  @page {
    size: 80mm auto;
    margin: 3mm 2mm;
  }
}
`;

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
  const style = thermal ? document.createElement("style") : null;
  if (style) {
    style.setAttribute("data-print-page", "receipt");
    style.textContent = RECEIPT_PAGE_STYLE;
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
        heightMicrons: receiptHeightMicrons(thermal),
      })
      .finally(cleanup);
    return;
  }

  window.print();
}
