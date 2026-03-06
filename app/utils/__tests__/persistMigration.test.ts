import { createMigrate } from "../persistMigration";

const fallback = { value: "fallback" };

describe("createMigrate", () => {
  test("applies v0 -> v1 migration", () => {
    const migrate = createMigrate(
      {
        0: (state) => ({
          ...(state as Record<string, unknown>),
          newField: true,
        }),
      },
      fallback,
    );

    expect(migrate({ existing: "data" }, 0)).toEqual({
      existing: "data",
      newField: true,
    });
  });

  test("applies sequential migrations v0 -> v1 -> v2", () => {
    const migrate = createMigrate(
      {
        0: (state) => ({
          ...(state as Record<string, unknown>),
          v1: true,
        }),
        1: (state) => ({
          ...(state as Record<string, unknown>),
          v2: true,
        }),
      },
      fallback,
    );

    expect(migrate({ original: true }, 0)).toEqual({
      original: true,
      v1: true,
      v2: true,
    });
  });

  test("skips already-applied migrations", () => {
    const migrate = createMigrate(
      {
        0: () => ({ version: "v1" }),
        1: (state) => ({
          ...(state as Record<string, unknown>),
          upgraded: true,
        }),
      },
      fallback,
    );

    // Starting from version 1, only v1->v2 migration should run
    expect(migrate({ existing: true }, 1)).toEqual({
      existing: true,
      upgraded: true,
    });
  });

  test("returns state unchanged when already at current version", () => {
    const migrate = createMigrate(
      { 0: () => ({ migrated: true }) },
      fallback,
    );

    const state = { already: "current" };
    expect(migrate(state, 1)).toEqual(state);
  });

  test("returns fallback state when migration throws", () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const migrate = createMigrate(
      {
        0: () => {
          throw new Error("migration crashed");
        },
      },
      fallback,
    );

    expect(migrate({ broken: true }, 0)).toEqual(fallback);
    expect(consoleWarn).toHaveBeenCalledWith(
      "[persist] Migration failed, using fallback state:",
      expect.any(Error),
    );

    consoleWarn.mockRestore();
  });

  test("handles null persisted state", () => {
    const migrate = createMigrate(
      { 0: (state) => state ?? { reset: true } },
      fallback,
    );

    expect(migrate(null, 0)).toEqual({ reset: true });
  });
});
