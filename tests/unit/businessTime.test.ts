import { describe, expect, it } from "vitest";
import {
  snapToBusinessHours,
  wallClockIn,
  instantFromWallClock,
  isValidTimeZone,
  DEFAULT_BUSINESS_HOURS,
} from "../../src/lib/businessTime.js";

const BERLIN = "Europe/Berlin";
const NEW_YORK = "America/New_York";

describe("isValidTimeZone", () => {
  it("accepts real IANA names", () => {
    expect(isValidTimeZone(BERLIN)).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects nonsense", () => {
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
    expect(isValidTimeZone("CET+2")).toBe(false);
  });
});

describe("wallClockIn", () => {
  it("reads the local clock, not UTC", () => {
    // 12:00 UTC in January is 13:00 in Berlin (UTC+1).
    const wall = wallClockIn(new Date("2026-01-05T12:00:00Z"), BERLIN);
    expect(wall).toMatchObject({ year: 2026, month: 1, day: 5, hour: 13, weekday: 1 });
  });

  it("follows daylight saving", () => {
    // Same UTC time in July is 14:00 in Berlin (UTC+2).
    const wall = wallClockIn(new Date("2026-07-06T12:00:00Z"), BERLIN);
    expect(wall.hour).toBe(14);
  });
});

describe("instantFromWallClock", () => {
  it("round-trips through a timezone", () => {
    const instant = instantFromWallClock(
      { year: 2026, month: 1, day: 5, hour: 9, minute: 0 },
      BERLIN,
    );
    expect(instant.toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });

  it("round-trips across a daylight-saving change", () => {
    const instant = instantFromWallClock(
      { year: 2026, month: 7, day: 6, hour: 9, minute: 0 },
      BERLIN,
    );
    expect(instant.toISOString()).toBe("2026-07-06T07:00:00.000Z");
  });
});

describe("snapToBusinessHours", () => {
  it("leaves a time that is already inside working hours alone", () => {
    // Monday 11:00 Berlin.
    const inside = new Date("2026-01-05T10:00:00Z");
    expect(snapToBusinessHours(inside, BERLIN, DEFAULT_BUSINESS_HOURS)).toEqual(inside);
  });

  it("moves a Sunday 03:00 to Monday opening time", () => {
    const sunday = new Date("2026-01-04T03:00:00Z");
    const snapped = snapToBusinessHours(sunday, BERLIN, DEFAULT_BUSINESS_HOURS);
    // Monday 5 Jan, 09:00 Berlin = 08:00 UTC in winter.
    expect(snapped.toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });

  it("moves an after-hours time to the next morning", () => {
    // Monday 22:00 Berlin.
    const lateMonday = new Date("2026-01-05T21:00:00Z");
    const snapped = snapToBusinessHours(lateMonday, BERLIN, DEFAULT_BUSINESS_HOURS);
    expect(snapped.toISOString()).toBe("2026-01-06T08:00:00.000Z");
  });

  it("moves a before-hours time to opening time the same day", () => {
    // Monday 06:00 Berlin.
    const earlyMonday = new Date("2026-01-05T05:00:00Z");
    const snapped = snapToBusinessHours(earlyMonday, BERLIN, DEFAULT_BUSINESS_HOURS);
    expect(snapped.toISOString()).toBe("2026-01-05T08:00:00.000Z");
  });

  it("skips the whole weekend from a Friday evening", () => {
    // Friday 9 Jan 2026, 20:00 Berlin.
    const fridayNight = new Date("2026-01-09T19:00:00Z");
    const snapped = snapToBusinessHours(fridayNight, BERLIN, DEFAULT_BUSINESS_HOURS);
    expect(snapped.toISOString()).toBe("2026-01-12T08:00:00.000Z"); // Monday
  });

  it("respects a different timezone for the same instant", () => {
    // 02:00 UTC Monday is 21:00 Sunday in New York — still the weekend there.
    const instant = new Date("2026-01-05T02:00:00Z");
    const snapped = snapToBusinessHours(instant, NEW_YORK, DEFAULT_BUSINESS_HOURS);
    expect(snapped.toISOString()).toBe("2026-01-05T14:00:00.000Z"); // Mon 09:00 EST
  });

  it("honours custom opening hours and working days", () => {
    const saturdayTrading = { startHour: 10, endHour: 14, workingDays: [6] };
    // Monday 5 Jan → next Saturday 10 Jan at 10:00 Berlin.
    const snapped = snapToBusinessHours(
      new Date("2026-01-05T08:00:00Z"),
      BERLIN,
      saturdayTrading,
    );
    expect(snapped.toISOString()).toBe("2026-01-10T09:00:00.000Z");
  });
});
