export function focusFormSelect(id: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el instanceof HTMLElement) el.focus();
    });
  });
}
