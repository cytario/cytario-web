import {
  clampFloatRect,
  createSidebarStore,
  FLOAT_CASCADE,
  FLOAT_INSET,
  FLOAT_MIN_VISIBLE_HEIGHT,
  nextFloatRect,
} from "../createSidebarStore";

describe("clampFloatRect", () => {
  const bounds = { width: 1000, height: 800 };

  test("keeps a panel fully inside the bounds box", () => {
    expect(clampFloatRect({ x: -10, y: -10, width: 320 }, bounds)).toEqual({
      x: 0,
      y: 0,
      width: 320,
    });
    expect(clampFloatRect({ x: 900, y: 900, width: 320 }, bounds)).toEqual({
      x: 680,
      y: 704,
      width: 320,
    });
  });

  test("keeps the header slice of a too-large panel reachable, never negative", () => {
    const rect = clampFloatRect({ x: 50, y: 50, width: 320 }, { width: 100, height: 100 });
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(Math.min(50, 100 - FLOAT_MIN_VISIBLE_HEIGHT));
  });
});

describe("nextFloatRect", () => {
  const bounds = { width: 1600, height: 900 };

  test("insets the first panel and cascades the following ones", () => {
    expect(nextFloatRect(bounds, 320, 0)).toEqual({ x: FLOAT_INSET, y: FLOAT_INSET, width: 320 });
    expect(nextFloatRect(bounds, 320, 2)).toEqual({
      x: FLOAT_INSET + 2 * FLOAT_CASCADE,
      y: FLOAT_INSET + 2 * FLOAT_CASCADE,
      width: 320,
    });
  });

  test("clamps a long cascade back inside the bounds box", () => {
    const rect = nextFloatRect({ width: 500, height: 300 }, 320, 40);
    expect(rect.x).toBeLessThanOrEqual(500 - 320);
    expect(rect.y).toBeLessThan(300);
  });

  test("never goes negative when the bounds are narrower than the panel", () => {
    expect(nextFloatRect({ width: 0, height: 0 }, 320, 5)).toEqual({ x: 0, y: 0, width: 320 });
  });
});

describe("sidebar section state", () => {
  const rect = { x: 10, y: 20, width: 320 };

  test("float and bringToFront maintain a stacking order", () => {
    const store = createSidebarStore({ name: "layout-stacking" });

    store.getState().float("overview", rect);
    store.getState().float("channels", rect);
    expect(store.getState().sections.channels.z).toBeGreaterThan(
      store.getState().sections.overview.z ?? 0,
    );

    store.getState().bringToFront("overview");
    expect(store.getState().sections.overview.z).toBeGreaterThan(
      store.getState().sections.channels.z ?? 0,
    );
  });

  test("docking drops the placement and keeps the accordion state", () => {
    const store = createSidebarStore({ name: "layout-dock" });
    store.getState().toggleSection("overview");
    store.getState().float("overview", rect);

    store.getState().dock("overview");

    expect(store.getState().sections.overview).toEqual({ isOpen: false });
  });

  test("toggleSection flips the open state, defaulting to open", () => {
    const store = createSidebarStore({ name: "layout-toggle" });

    store.getState().toggleSection("overview");
    store.getState().toggleSection("overview");
    store.getState().toggleSection("channels");

    expect(store.getState().sections.overview.isOpen).toBe(true);
    expect(store.getState().sections.channels.isOpen).toBe(false);
  });

  test("floating a section shows a hidden float set", () => {
    const store = createSidebarStore({ name: "layout-unhide" });
    store.getState().setFloatsHidden(true);

    store.getState().float("overview", rect);

    expect(store.getState().floatsHidden).toBe(false);
  });

  test("float after dock spawns at a fresh cascaded offset, not the old position", () => {
    const store = createSidebarStore({ name: "layout-refloat" });
    store.getState().float("overview", { x: 500, y: 500, width: 320 });
    store.getState().dock("overview");

    store.getState().float("overview", rect);

    expect(store.getState().sections.overview.rect).toEqual(rect);
  });

  test("bringToFront on a docked section is a no-op", () => {
    const store = createSidebarStore({ name: "layout-noop" });
    store.getState().float("overview", rect);
    store.getState().dock("overview");
    const before = store.getState();

    store.getState().bringToFront("overview");

    expect(store.getState().sections).toBe(before.sections);
    expect(store.getState().topZ).toBe(before.topZ);
  });

  test("z stays bounded under the chrome's z range across many activations", () => {
    const store = createSidebarStore({ name: "layout-zspan" });
    store.getState().float("overview", rect);
    store.getState().float("channels", rect);
    for (let i = 0; i < 25; i += 1) {
      store.getState().bringToFront("overview");
    }

    const { sections, topZ } = store.getState();
    expect(topZ).toBeLessThanOrEqual(19);
    expect(Math.max(...Object.values(sections).map((entry) => entry.z ?? 0))).toBeLessThanOrEqual(
      19,
    );
  });

  test("resetFloating clears every placement, accordion state survives", () => {
    const store = createSidebarStore({ name: "layout-reset" });
    store.getState().float("overview", rect);
    store.getState().toggleSection("channels");

    store.getState().resetFloating();

    expect(store.getState().sections.overview.rect).toBeUndefined();
    expect(store.getState().sections.channels).toEqual({ isOpen: false });
    expect(store.getState().topZ).toBe(0);
  });

  test("section state persists; stacking order does not", () => {
    const store = createSidebarStore({ name: "layout-persist" });
    store.getState().float("overview", rect);
    store.getState().toggleSection("channels");

    const persisted = JSON.parse(localStorage.getItem("layout-persist") ?? "{}").state;
    expect(persisted.isOpen).toBe(true);
    expect(persisted.width).toBe(320);
    expect(persisted.sections.overview).toEqual({ isOpen: true, rect });
    expect(persisted.sections.channels).toEqual({ isOpen: false });
  });
});
