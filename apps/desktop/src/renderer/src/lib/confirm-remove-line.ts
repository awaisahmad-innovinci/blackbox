export function confirmRemoveTableLine(label?: string): boolean {
  return window.confirm(
    label
      ? `Remove ${label} from this list?`
      : "Remove this line from this list?",
  );
}
