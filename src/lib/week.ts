// Week-date helpers for the Weekly Overview. Everything works in UTC on
// `YYYY-MM-DD` strings so the rendered week is stable regardless of the server's
// timezone. The Alsama school week is Monday–Friday.

/** The five school weekdays, in order, as stable keys. */
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Short header labels for the weekday columns. */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Sun-first so a UTC `getUTCDay()` (0 = Sun) indexes straight in.
const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Parse a `YYYY-MM-DD` string to a UTC-midnight Date, or null if malformed. */
function parseISO(iso: string): Date | null {
  if (!ISO_DATE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject impossible dates (e.g. 2026-02-31 would roll over).
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

/** Format a UTC Date back to `YYYY-MM-DD`. */
function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's date as `YYYY-MM-DD` (UTC). */
export function todayISO(): string {
  return toISO(new Date());
}

/**
 * Today's date as `YYYY-MM-DD` in Asia/Beirut wall-clock time — the app's canonical
 * "today". Use this (not `todayISO`) wherever the calendar day itself matters (which
 * week is current, which column is today): near midnight UTC the Beirut date differs,
 * and this app plans in Beirut. `en-CA` yields an ISO `YYYY-MM-DD`; Gregorian + Latin
 * digits are pinned so it stays a valid ISO string under any locale default.
 */
export function todayInBeirut(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Beirut',
    calendar: 'gregory',
    numberingSystem: 'latn',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add `days` to a `YYYY-MM-DD` string, returning a new `YYYY-MM-DD` string. */
export function addDays(iso: string, days: number): string {
  const date = parseISO(iso) ?? new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return toISO(date);
}

/** The Monday (`YYYY-MM-DD`) of the week containing `iso`. */
export function mondayOf(iso: string): string {
  const date = parseISO(iso);
  if (!date) return mondayOf(todayISO());
  const day = date.getUTCDay(); // 0 = Sun … 6 = Sat
  const offset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + offset);
  return toISO(date);
}

/** The Monday of the current week. */
export function currentMonday(): string {
  return mondayOf(todayISO());
}

/**
 * Resolve the `?week=` search param to a valid Monday. Any value is snapped to
 * the Monday of its week; a missing or malformed value falls back to this week.
 */
export function resolveWeekStart(weekParam: string | undefined): string {
  if (!weekParam || !parseISO(weekParam)) return currentMonday();
  return mondayOf(weekParam);
}

/** The five Mon–Fri dates (`YYYY-MM-DD`) for a given Monday, keyed by weekday. */
export function weekdayDates(monday: string): Record<Weekday, string> {
  return {
    mon: monday,
    tue: addDays(monday, 1),
    wed: addDays(monday, 2),
    thu: addDays(monday, 3),
    fri: addDays(monday, 4),
  };
}

/**
 * Human label for a week's Mon–Fri span, e.g. "15 – 19 June 2026" or, when the
 * span crosses a month boundary, "29 June – 3 July 2026".
 */
export function formatWeekRange(monday: string): string {
  const start = parseISO(monday) ?? new Date();
  const end = parseISO(addDays(monday, 4)) ?? start;

  const startDay = start.getUTCDate();
  const endDay = end.getUTCDate();
  const startMonth = MONTHS[start.getUTCMonth()];
  const endMonth = MONTHS[end.getUTCMonth()];
  const year = end.getUTCFullYear();

  if (startMonth === endMonth) {
    return `${startDay} – ${endDay} ${endMonth} ${year}`;
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${year}`;
}

/** True when `iso` is a real `YYYY-MM-DD` calendar date (rejects malformed/impossible dates). */
export function isValidISODate(iso: string): boolean {
  return parseISO(iso) !== null;
}

/** Human label for a single date, e.g. "Tuesday 17 June 2026". Falls back to the raw string. */
export function formatLongDate(iso: string): string {
  const date = parseISO(iso);
  if (!date) return iso;
  const weekdayNames = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  ];
  const weekday = weekdayNames[date.getUTCDay()];
  return `${weekday} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Mon, Jun 15" — weekday + abbreviated month + day, no year. For day-column headers. */
export function formatWeekdayDate(iso: string): string {
  const date = parseISO(iso);
  if (!date) return iso;
  return `${WEEKDAYS_SHORT[date.getUTCDay()]}, ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** "Jun 15, 2026" — abbreviated month + day + year. For the "Week of …" label. */
export function formatMonthDayYear(iso: string): string {
  const date = parseISO(iso);
  if (!date) return iso;
  return `${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

/** Whole days from `fromISO` to `toISO` (negative if `to` precedes `from`). 0 for malformed input. */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = parseISO(fromISO);
  const b = parseISO(toISO);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** "Mon 7 Sep 2026" — short weekday + day + abbreviated month + year. For the term calendar. */
export function formatShortWeekdayDate(iso: string): string {
  const date = parseISO(iso);
  if (!date) return iso;
  return `${WEEKDAYS_SHORT[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/**
 * The academic year a date belongs to, as the anchoring September's calendar year.
 * Sep–Dec → that year; Jan–Aug → the previous year (e.g. 2027-02-01 → 2026, the
 * "2026 / 27" year anchored at September 2026). Falls back to the date's own year.
 */
export function academicYearOf(iso: string): number {
  const date = parseISO(iso);
  if (!date) return new Date().getUTCFullYear();
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= 8 ? year : year - 1;
}

/** Which weekday a `YYYY-MM-DD` date falls on, or null for weekends. */
export function weekdayOf(iso: string): Weekday | null {
  const date = parseISO(iso);
  if (!date) return null;
  const day = date.getUTCDay();
  if (day < 1 || day > 5) return null;
  return WEEKDAYS[day - 1];
}
