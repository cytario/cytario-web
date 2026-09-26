import { describe, expect, test } from "vitest";

import { useTourControllerStore } from "../useTourController";

describe("useTourController", () => {
  test("requestTour queues a replay request", () => {
    useTourControllerStore.getState().requestTour("getting-started");

    expect(useTourControllerStore.getState().requestedTourId).toBe("getting-started");
  });

  test("consumeRequest returns and clears the request", () => {
    useTourControllerStore.getState().requestTour("viewer");

    expect(useTourControllerStore.getState().consumeRequest()).toBe("viewer");
    expect(useTourControllerStore.getState().requestedTourId).toBeNull();
    expect(useTourControllerStore.getState().consumeRequest()).toBeNull();
  });
});
