import { describe, expect, test, beforeEach } from "vitest";

import {
  usePinnedPathsStore,
  selectIsPinned,
  type PinnedPath,
} from "../pinnedPathsStore";

const makePin = (name: string): PinnedPath => ({
  provider: "aws",
  bucketName: "test-bucket",
  pathName: `path/${name}`,
  displayName: name,
});

describe("pinnedPathsStore", () => {
  beforeEach(() => {
    usePinnedPathsStore.setState({ items: [] });
  });

  test("adds a pin to the store", () => {
    const pin = makePin("folder-a");
    usePinnedPathsStore.getState().addPin(pin);

    const items = usePinnedPathsStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].displayName).toBe("folder-a");
  });

  test("moves duplicate pin to front instead of adding twice", () => {
    const pin1 = makePin("folder-a");
    const pin2 = makePin("folder-b");

    usePinnedPathsStore.getState().addPin(pin1);
    usePinnedPathsStore.getState().addPin(pin2);
    usePinnedPathsStore.getState().addPin(pin1);

    const items = usePinnedPathsStore.getState().items;
    expect(items).toHaveLength(2);
    expect(items[0].displayName).toBe("folder-a");
    expect(items[1].displayName).toBe("folder-b");
  });

  test("enforces maximum of 10 items", () => {
    for (let i = 0; i < 12; i++) {
      usePinnedPathsStore.getState().addPin(makePin(`folder-${i}`));
    }

    const items = usePinnedPathsStore.getState().items;
    expect(items).toHaveLength(10);
    expect(items[0].displayName).toBe("folder-11");
  });

  test("removes a pin by resource ID", () => {
    const pin = makePin("folder-a");
    usePinnedPathsStore.getState().addPin(pin);
    expect(usePinnedPathsStore.getState().items).toHaveLength(1);

    usePinnedPathsStore.getState().removePin("aws/test-bucket/path/folder-a");
    expect(usePinnedPathsStore.getState().items).toHaveLength(0);
  });

  test("clearAll removes all items", () => {
    usePinnedPathsStore.getState().addPin(makePin("folder-a"));
    usePinnedPathsStore.getState().addPin(makePin("folder-b"));
    expect(usePinnedPathsStore.getState().items).toHaveLength(2);

    usePinnedPathsStore.getState().clearAll();
    expect(usePinnedPathsStore.getState().items).toHaveLength(0);
  });
});

describe("selectIsPinned", () => {
  beforeEach(() => {
    usePinnedPathsStore.setState({ items: [] });
  });

  test("returns true when path is pinned", () => {
    usePinnedPathsStore.getState().addPin(makePin("folder-a"));
    const state = usePinnedPathsStore.getState();
    const isPinned = selectIsPinned("aws", "test-bucket", "path/folder-a");
    expect(isPinned(state)).toBe(true);
  });

  test("returns false when path is not pinned", () => {
    const state = usePinnedPathsStore.getState();
    const isPinned = selectIsPinned("aws", "test-bucket", "path/other");
    expect(isPinned(state)).toBe(false);
  });

  test("returns false for different provider", () => {
    usePinnedPathsStore.getState().addPin(makePin("folder-a"));
    const state = usePinnedPathsStore.getState();
    const isPinned = selectIsPinned("gcs", "test-bucket", "path/folder-a");
    expect(isPinned(state)).toBe(false);
  });
});
