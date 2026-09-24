import { describe, it, expect } from "vitest";
import {
  wallClockIn,
  instantFromWallClock,
  snapToBusinessHours,
  isValidTimeZone,
  DEFAULT_BUSINESS_HOURS,
} from "@/lib/businessTime";

describe("businessTime", () => {
  it("validates timezone names", () => {
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("Not/AZone")).toBe(false);
  });

  it("round-trips a wall clock time through a timezone", () => {
    const instant = instantFromWallClock(
      { year: 2026, month: 6, day: 15, hour: 10, minute: 30 },
      "America/New_York",
    );
    const wall = wallClockIn(instant, "America/New_York");
    expect(wall.hour).toBe(10);
    expect(wall.minute).toBe(30);
    expect(wall.day).toBe(15);
  });

  it("leaves a time already inside business hours unchanged", () => {
    const tuesdayAt11 = instantFromWallClock(
      { year: 2026, month: 6, day: 16, hour: 11, minute: 0 },
      "UTC",
    );
    const snapped = snapToBusinessHours(tuesdayAt11, "UTC", DEFAULT_BUSINESS_HOURS);
    expect(snapped.getTime()).toBe(tuesdayAt11.getTime());
  });

  it("pushes a time before opening to the start of the same working day", () => {
    const tuesdayAt3am = instantFromWallClock(
      { year: 2026, month: 6, day: 16, hour: 3, minute: 0 },
      "UTC",
    );
    const snapped = snapToBusinessHours(tuesdayAt3am, "UTC", DEFAULT_BUSINESS_HOURS);
    const wall = wallClockIn(snapped, "UTC");
    expect(wall.hour).toBe(DEFAULT_BUSINESS_HOURS.startHour);
    expect(wall.day).toBe(16);
  });

  it("pushes a weekend time to the next working day", () => {
    // 2026-06-20 is a Saturday.
    const saturday = instantFromWallClock({ year: 2026, month: 6, day: 20, hour: 12, minute: 0 }, "UTC");
    const snapped = snapToBusinessHours(saturday, "UTC", DEFAULT_BUSINESS_HOURS);
    const wall = wallClockIn(snapped, "UTC");
    expect(wall.weekday).toBe(1); // Monday
    expect(wall.hour).toBe(DEFAULT_BUSINESS_HOURS.startHour);
  });

  it("pushes an after-hours time to the next working day", () => {
    const tuesdayAt6pm = instantFromWallClock(
      { year: 2026, month: 6, day: 16, hour: 18, minute: 0 },
      "UTC",
    );
    const snapped = snapToBusinessHours(tuesdayAt6pm, "UTC", DEFAULT_BUSINESS_HOURS);
    const wall = wallClockIn(snapped, "UTC");
    expect(wall.day).toBe(17);
    expect(wall.hour).toBe(DEFAULT_BUSINESS_HOURS.startHour);
  });
});
