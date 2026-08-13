const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Takes the decimal string the API returns, e.g. "1000.50" -> "$1,000.50". */
export function currency(decimal: string): string {
  return currencyFormatter.format(Number(decimal));
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** "2026-08-20" -> "Aug 20, 2026". Always UTC — matches how dueDate is stored and compared. */
export function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

/** An ISO timestamp -> "Aug 20, 2026, 3:04 PM UTC". Used for audit-style "recorded at" columns. */
export function formatDateTime(isoTimestamp: string): string {
  return dateTimeFormatter.format(new Date(isoTimestamp));
}

/** Today's date in UTC, as "YYYY-MM-DD" — matches how dueDate/paidAt are stored and compared. */
export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function toUtcDayNumber(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const MS_PER_DAY = 86_400_000;

/**
 * "5 days ago" / "in 3 days" / "today" — or null when it is not worth surfacing
 * (more than two weeks in the future). Computed the same way `deriveStatus`
 * compares dates, so it never disagrees with the status badge next to it.
 */
export function relativeDueHint(isoDate: string, now = new Date()): string | null {
  const due = toUtcDayNumber(new Date(`${isoDate}T00:00:00Z`));
  const today = toUtcDayNumber(now);
  const diffDays = Math.round((due - today) / MS_PER_DAY);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 1 && diffDays <= 14) return `in ${diffDays} days`;
  if (diffDays < -1) return `${Math.abs(diffDays)} days ago`;
  return null;
}
