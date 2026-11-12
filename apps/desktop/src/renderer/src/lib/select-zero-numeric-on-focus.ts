import type { FocusEvent, KeyboardEvent } from "react";

/** Display blank when numeric value is zero (cleared field). */
export function numericInputDisplayValue(value: number): string | number {
  return value === 0 ? "" : value;
}

/** Parse input change; empty string maps to 0 in state. */
export function parseNumericInputChange(raw: string): number {
  if (raw === "") return 0;
  const n = Number(raw);
  return Number.isNaN(n) ? 0 : n;
}

/** Select input text when value is empty or zero so typing replaces instead of appending. */
export function selectZeroNumericOnFocus(
  event: FocusEvent<HTMLInputElement>,
): void {
  const { value } = event.currentTarget;
  if (value === "" || Number(value) === 0) {
    event.currentTarget.select();
  }
}

/** When input shows 0 (or empty) and user types a digit without re-focusing, replace instead of append. */
export function replaceLeadingZeroOnKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
): void {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
    return;
  }
  if (event.key.length !== 1 || !/\d/.test(event.key)) return;

  const input = event.currentTarget;
  const { value, selectionStart, selectionEnd } = input;
  if (selectionStart == null || selectionEnd == null) return;

  const allSelected =
    selectionStart === 0 && selectionEnd === value.length && value.length > 0;
  if (allSelected) return;

  const isZeroLike = value === "" || value === "0" || Number(value) === 0;
  if (!isZeroLike) return;

  event.preventDefault();
  input.value = event.key;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
