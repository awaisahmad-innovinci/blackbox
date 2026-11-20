const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Store calendar is Pakistan (UTC+5, no daylight saving). */
const BUSINESS_OFFSET = "+05:00";

function businessInstant(date: string, time: string): string | null {
  const parsed = new Date(`${date}T${time}${BUSINESS_OFFSET}`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** Start of a Pakistan calendar day, as a UTC ISO string. */
export function businessDayStartUtc(date: string): string {
  return businessInstant(date, "00:00:00.000") ?? `${date}T00:00:00.000Z`;
}

/** End of a Pakistan calendar day, as a UTC ISO string. */
export function businessDayEndUtc(date: string): string {
  return businessInstant(date, "23:59:59.999") ?? `${date}T23:59:59.999Z`;
}

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
