/**
 * Display helpers. Weights are stored as plain numbers, so switching the whole
 * app to pounds is a matter of changing UNIT here.
 */
export const UNIT = "kg";

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const SHORT_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** Drops trailing zeros: 62.50 -> "62.5", 60.00 -> "60". */
export function formatNumber(value, maxDecimals = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "–";
  return num.toLocaleString(undefined, { maximumFractionDigits: maxDecimals });
}

export function formatWeight(value) {
  if (value === null || value === undefined) return "–";
  const num = Number(value);
  if (num === 0) return `bodyweight`;
  return `${formatNumber(num)} ${UNIT}`;
}

/** Total load moved; tonnes once the number stops being readable in kg. */
export function formatVolume(value) {
  const num = Number(value ?? 0);
  if (num >= 10000) return `${formatNumber(num / 1000, 1)} t`;
  return `${formatNumber(num, 0)} ${UNIT}`;
}

export function formatDate(iso) {
  if (!iso) return "–";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : DATE_FORMAT.format(date);
}

export function formatShortDate(iso) {
  if (!iso) return "–";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : SHORT_DATE_FORMAT.format(date);
}

/** "today" / "yesterday" / "5 days ago" — a quick sense of recency. */
export function relativeDay(iso) {
  if (!iso) return "";
  const then = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(then.getTime())) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today - then) / 86400000);

  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 0) return `in ${plural(-days, "day")}`;
  if (days < 30) return `${plural(days, "day")} ago`;
  if (days < 365) return `${plural(Math.round(days / 30), "month")} ago`;
  return `${plural(Math.round(days / 365), "year")} ago`;
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function todayIso() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

/** Signed change between two numbers, for progress deltas. */
export function formatDelta(current, previous) {
  if (previous === null || previous === undefined) return "";
  const diff = Number(current) - Number(previous);
  if (Math.abs(diff) < 0.01) return "±0";
  return `${diff > 0 ? "+" : "−"}${formatNumber(Math.abs(diff))}`;
}
