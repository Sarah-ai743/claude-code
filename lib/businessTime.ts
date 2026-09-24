/**
 * Timezone-aware scheduling helpers.
 *
 * Why this exists: an AI model is unreliable at date arithmetic, and a
 * follow-up that lands at 03:00 on a Sunday is worse than no follow-up at all.
 * So the model is only ever asked "how long should we wait?" — turning that
 * into a real instant, inside the business's own working hours, is done here in
 * plain deterministic code that can be unit-tested.
 *
 * Everything uses the built-in `Intl` timezone database. No extra dependency,
 * and daylight-saving transitions are handled by the platform rather than by us.
 */

export interface BusinessHours {
  /** Local hour the business opens, 0–23. */
  startHour: number;
  /** Local hour the business closes, 1–24. Exclusive. */
  endHour: number;
  /** Working days as 0=Sunday … 6=Saturday. */
  workingDays: number[];
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  startHour: 9,
  endHour: 17,
  workingDays: [1, 2, 3, 4, 5],
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

interface WallClock {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  /** 0=Sunday … 6=Saturday */
  weekday: number;
}

/** What does the clock on the wall in `timeZone` read at this instant? */
export function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    return part ? Number(part.value) : 0;
  };

  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");

  // Treat the wall clock as if it were UTC purely to derive the day of week.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return { year, month, day, hour, minute, weekday };
}

/** Offset of `timeZone` from UTC, in milliseconds, at this instant. */
function offsetMs(instant: Date, timeZone: string): number {
  const wall = wallClockIn(instant, timeZone);
  const asIfUTC = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  // Seconds and milliseconds are not in the wall clock, so drop them from both sides.
  const truncated = Math.floor(instant.getTime() / 60_000) * 60_000;
  return asIfUTC - truncated;
}

/** The instant at which the clock in `timeZone` reads this local date and time. */
export function instantFromWallClock(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const asIfUTC = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);

  // First guess, then correct: around a DST change the offset before and after
  // the jump differ, so the offset is re-read at the corrected instant.
  const firstGuess = new Date(asIfUTC - offsetMs(new Date(asIfUTC), timeZone));
  return new Date(asIfUTC - offsetMs(firstGuess, timeZone));
}

/**
 * Moves `earliest` forward to the first moment that is inside the business's
 * working hours, in the business's own timezone. A time that is already inside
 * working hours is returned unchanged.
 */
export function snapToBusinessHours(
  earliest: Date,
  timeZone: string,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
): Date {
  const workingDays = hours.workingDays.length > 0 ? hours.workingDays : [1, 2, 3, 4, 5];
  let cursor = earliest;

  // A business closed every day would loop forever; 14 days is a safe ceiling.
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const wall = wallClockIn(cursor, timeZone);
    const isWorkingDay = workingDays.includes(wall.weekday);

    if (isWorkingDay && wall.hour >= hours.startHour && wall.hour < hours.endHour) {
      return cursor;
    }

    if (isWorkingDay && wall.hour < hours.startHour) {
      // Same day, but before opening: wait until the doors open.
      return instantFromWallClock(
        { ...wall, hour: hours.startHour, minute: 0 },
        timeZone,
      );
    }

    // Closed for the day (or not a working day): try the next morning.
    const nextDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day + 1));
    cursor = instantFromWallClock(
      {
        year: nextDay.getUTCFullYear(),
        month: nextDay.getUTCMonth() + 1,
        day: nextDay.getUTCDate(),
        hour: hours.startHour,
        minute: 0,
      },
      timeZone,
    );
  }

  return cursor;
}

/** Human-readable rendering of an instant in the business's timezone. */
export function formatInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(instant);
}
