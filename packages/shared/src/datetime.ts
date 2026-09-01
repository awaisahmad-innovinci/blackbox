const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Receipt calendar date + current wall-clock time → ISO UTC string. */
export function buildReceivedAtIso(receiptDate?: string): string {
  const now = new Date();
  const trimmed = receiptDate?.trim();
  if (!trimmed) return now.toISOString();

  const parts = trimmed.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return now.toISOString();

  const result = new Date(now);
  result.setFullYear(year, month - 1, day);
  return result.toISOString();
}

/** Safe display for ISO timestamps or legacy YYYY-MM-DD (no fake midnight time). */
export function formatStoredDateTime(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  if (DATE_ONLY_PATTERN.test(value)) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
