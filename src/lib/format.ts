/**
 * Locale-aware formatting helpers.
 *
 * A single home for date/time/number rendering so every surface routes through
 * the same `Intl` configuration. Pass the active locale (from `useLocale()` in a
 * client component or `getLocale()` in a server one) — these are pure functions
 * and never read the request themselves.
 *
 * Two settings are pinned across the board:
 *  - `numberingSystem: 'latn'` — digits stay 0–9 even under `ar` (the product
 *    keeps Latin digits; only month/day names localise).
 *  - `calendar: 'gregory'` — Gregorian, never the Islamic calendar.
 *
 * NOTE: not adopted at call sites yet — surfaces migrate their own formatting to
 * these helpers (known sites: EditorSubHeader's hardcoded en-GB date, the
 * settings guide tabs, LessonPickerModal).
 */

/** App timezone for schedule wall-clock times (lessons are planned in Beirut). */
export const APP_TIME_ZONE = 'Asia/Beirut';

type DateInput = Date | string | number;

const BASE_DATE: Intl.DateTimeFormatOptions = {
  calendar: 'gregory',
  numberingSystem: 'latn',
};

const BASE_NUMBER: Intl.NumberFormatOptions = {
  numberingSystem: 'latn',
};

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Format a calendar date. Defaults to a full day/month/year; pass `options` to
 * override. Returns an empty string for an unparseable input.
 */
export function formatDate(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...BASE_DATE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...options,
  }).format(date);
}

/**
 * Format a wall-clock time. Defaults to the app timezone (Asia/Beirut) so a
 * schedule slot reads the same regardless of the viewer's timezone; override via
 * `options.timeZone` if needed. Returns an empty string for an unparseable input.
 */
export function formatTime(
  value: DateInput,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    ...BASE_DATE,
    timeZone: APP_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  }).format(date);
}

/**
 * Format a number with Latin digits. Numbers in this app are mostly integer
 * minutes, so this stays intentionally minimal — pass `options` for the rare
 * case that needs decimals or units.
 */
export function formatNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, { ...BASE_NUMBER, ...options }).format(value);
}
