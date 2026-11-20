const RECEIPT_PAGE_STYLE = `
@media print {
  @page {
    size: 80mm auto;
    margin: 3mm 2mm;
  }
}
`;

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
  window.print();
}
