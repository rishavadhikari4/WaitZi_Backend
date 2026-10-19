// src/utils/time.ts

/** Offset (ms) of `timeZone` from UTC at `date`. */
function offsetMs(timeZone: string, date: Date): number {
  const local = new Date(date.toLocaleString('en-US', { timeZone }));
  const utc = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  return local.getTime() - utc.getTime();
}

/**
 * Midnight of today in `timeZone`, as a UTC instant. "Today's sales" must
 * follow the restaurant's clock, not the server's (a UTC host is 5h45m off
 * Nepal time).
 */
export function startOfDayIn(timeZone: string, now = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - offsetMs(timeZone, utcMidnight));
}

export const DEFAULT_TIMEZONE = 'Asia/Kathmandu';
