export function focusFormField(id: string): boolean {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLElement)) return false;
  el.focus();
  if (el instanceof HTMLInputElement && el.type === "text") {
    el.select();
  }
  return document.activeElement === el;
}

export function focusFormSelect(id: string): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (focusFormField(id)) return;
      requestAnimationFrame(() => {
        focusFormField(id);
      });
    });
  });
}

/** Whether a focus target exists in the DOM (used before blocking Radix auto-focus). */
export function hasFocusTarget(id: string): boolean {
  const el = document.getElementById(id);
  return el instanceof HTMLElement;
}
