import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { TOUR_STORAGE_KEY, useTourProgressStore } from "../useTourProgress";

describe("useTourProgress", () => {
  beforeEach(() => {
    localStorage.clear();
    useTourProgressStore.setState({ byUser: {} });
  });

  afterEach(() => {
    localStorage.clear();
  });

  test("reports incomplete for an unknown user", () => {
    expect(useTourProgressStore.getState().isComplete("user-a", "getting-started")).toBe(false);
  });

  test("completing a tour persists per user", () => {
    const store = useTourProgressStore.getState();
    store.completeTour("user-a", "getting-started");

    expect(useTourProgressStore.getState().isComplete("user-a", "getting-started")).toBe(true);
    expect(useTourProgressStore.getState().isComplete("user-b", "getting-started")).toBe(false);
    expect(localStorage.getItem(TOUR_STORAGE_KEY)).toContain("user-a");
  });

  test("completing the same tour twice is idempotent", () => {
    const store = useTourProgressStore.getState();
    store.completeTour("user-a", "viewer");
    const firstSnapshot = useTourProgressStore.getState().byUser;
    store.completeTour("user-a", "viewer");

    expect(useTourProgressStore.getState().byUser).toEqual(firstSnapshot);
  });

  test("resetUser removes only that user's progress", () => {
    const store = useTourProgressStore.getState();
    store.completeTour("user-a", "viewer");
    store.completeTour("user-b", "viewer");

    useTourProgressStore.getState().resetUser("user-a");

    expect(useTourProgressStore.getState().isComplete("user-a", "viewer")).toBe(false);
    expect(useTourProgressStore.getState().isComplete("user-b", "viewer")).toBe(true);
  });

  test("a blocked localStorage falls back to in-memory state without crashing", () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error("QuotaExceededError");
    };

    const store = useTourProgressStore.getState();
    expect(() => store.completeTour("user-c", "viewer")).not.toThrow();
    expect(useTourProgressStore.getState().isComplete("user-c", "viewer")).toBe(true);

    localStorage.setItem = original;
  });
});
