/**
 * Locale-aware formatters, thin wrappers over `Intl`. Surfaces adopt these at
 * their own call sites (not wired up here) so dates, times and numbers localise
 * consistently once Arabic is live.
 *
 * Two things are pinned regardless of locale:
 *   - `numberingSystem: 'latn'` — digits stay Western 0–9 even in Arabic (only
 *     month/day *names* localise), matching the product decision.
 *   - `calendar: 'gregory'` — always the Gregorian calendar, never Hijri.
 *
 * Schedule times are wall-clock in Asia/Beirut, so `formatTime` pins that zone.
 */

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

const DATE_DEFAULTS: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
};

const TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

/** Format a date — Gregorian calendar, Latin digits, localised month/day names. */
export function formatDate(
  value: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    numberingSystem: 'latn',
    calendar: 'gregory',
    ...DATE_DEFAULTS,
    ...options,
  }).format(toDate(value));
}

/**
 * Format a wall-clock time in Asia/Beirut (schedule times are stored/displayed
 * in the centres' local zone). Latin digits, Gregorian calendar.
 */
export function formatTime(
  value: DateInput,
  locale: string,
  options: Intl.DateTimeFormatOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Beirut',
    numberingSystem: 'latn',
    calendar: 'gregory',
    ...TIME_DEFAULTS,
    ...options,
  }).format(toDate(value));
}

/**
 * Format a number with Latin digits. App numbers are mostly integer minutes, so
 * this stays minimal — pass `options` for anything richer.
 */
export function formatNumber(
  value: number,
  locale: string,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat(locale, {
    numberingSystem: 'latn',
    ...options,
  }).format(value);
}
