const FORMULA_PREFIX = /^[=+\-@]/;

/** RFC 4180 + Excel formula injection guard. */
export function csvField(value: string): string {
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
  return guarded;
}

export function toCsv(headers: string[], rows: string[][]): string {
  const lines = [headers.map(csvField), ...rows.map((row) => row.map(csvField))];
  return lines.map((line) => line.join(",")).join("\r\n") + "\r\n";
}
