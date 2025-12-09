import { describe, test, expect, vi, beforeAll, afterAll } from "vitest";

import { formatHumanReadableDate } from "../formatHumanReadableDate"; // Replace with the actual path to your module

describe(formatHumanReadableDate, () => {
  const mockDate = new Date("2024-12-03T12:00:00Z");

  beforeAll(() => {
    // Mock the current system time
    vi.setSystemTime(mockDate);
  });

  afterAll(() => {
    // Restore the original system time
    vi.useRealTimers();
  });

  test("formats date", () => {
    const result = formatHumanReadableDate(new Date("2023-12-01T12:00:00Z"));
    expect(result).toMatch("2023-12-01, 13:00 (about 1 year ago)");
  });
});
