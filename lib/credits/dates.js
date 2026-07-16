// dates.js — timezone-safe, date-only utilities for the credit engine.
//
// Credit charts are about CALENDAR DAYS, not instants. To avoid the classic
// "YYYY-MM-DD parsed as UTC then shifted a day in the browser" bug, every date
// here is an ISO date string ("2026-09-14") and all arithmetic goes through
// UTC-anchored Date objects that are never exposed. Day-of-week is computed in
// UTC so it is identical regardless of the machine's local timezone.

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
const MS_DAY = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Validate & parse an ISO date string into a UTC Date. Returns null if invalid
// (including impossible calendar dates like 2026-02-30).
function toUTC(iso) {
  const m = ISO_RE.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // reject overflow (e.g. Feb 30 rolls into March)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

function isValidISODate(iso) {
  return toUTC(iso) !== null;
}

// UTC Date -> "YYYY-MM-DD"
function fmt(dt) {
  return dt.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  const dt = toUTC(iso);
  if (!dt) throw new Error(`invalid ISO date: ${iso}`);
  return fmt(new Date(dt.getTime() + n * MS_DAY));
}

// Whole-day difference b - a (both ISO). Positive if b is after a.
function diffDays(a, b) {
  const da = toUTC(a), db = toUTC(b);
  if (!da || !db) throw new Error(`invalid ISO date in diff: ${a}, ${b}`);
  return Math.round((db.getTime() - da.getTime()) / MS_DAY);
}

// DayOfWeek constant for an ISO date, computed in UTC (browser-tz independent).
function dayOfWeek(iso) {
  const dt = toUTC(iso);
  if (!dt) throw new Error(`invalid ISO date: ${iso}`);
  return DAYS[dt.getUTCDay()];
}

// Occupied nights for [checkIn, checkOut) — check-out is EXCLUSIVE.
// checkIn 09-14, checkOut 09-19 => [09-14,09-15,09-16,09-17,09-18].
function enumerateNights(checkIn, checkOut) {
  if (!isValidISODate(checkIn)) throw new Error(`invalid check-in: ${checkIn}`);
  if (!isValidISODate(checkOut)) throw new Error(`invalid check-out: ${checkOut}`);
  const n = diffDays(checkIn, checkOut);
  const out = [];
  for (let i = 0; i < n; i++) out.push(addDays(checkIn, i));
  return out;
}

// Parse a WBW date token ("Jan 1" or "Mar 13 - Oct 1") into {start,end} ISO
// strings for the given year. A range whose end reads before its start wraps
// into the next calendar year. Returns null for unrecognized tokens.
function parseDateToken(token, year) {
  const parts = String(token).split('-').map((s) => s.trim());
  const parseOne = (str, y) => {
    const m = str.match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
    if (!m || !(m[1] in MONTHS)) return null;
    const dt = new Date(Date.UTC(y, MONTHS[m[1]], parseInt(m[2], 10)));
    if (dt.getUTCDate() !== parseInt(m[2], 10)) return null; // e.g. Feb 30
    return dt;
  };
  const start = parseOne(parts[0], year);
  if (!start) return null;
  if (parts.length === 1) return { start: fmt(start), end: fmt(start) };
  let end = parseOne(parts[1], year);
  if (!end) return null;
  if (end < start) end = parseOne(parts[1], year + 1); // wraps past new year
  return { start: fmt(start), end: fmt(end) };
}

// Human display: "2026-09-14" -> "Sep 14"
function shortDate(iso) {
  const dt = toUTC(iso);
  if (!dt) return iso;
  const names = Object.keys(MONTHS);
  return `${names[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
}

module.exports = {
  DAYS,
  MONTHS,
  isValidISODate,
  addDays,
  diffDays,
  dayOfWeek,
  enumerateNights,
  parseDateToken,
  shortDate,
};
