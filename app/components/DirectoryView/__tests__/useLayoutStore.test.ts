import { useLayoutStore, type ViewMode } from "../useLayoutStore";
import { createMigrate } from "~/utils/persistMigration";

describe("useLayoutStore", () => {
  beforeEach(() => {
    useLayoutStore.setState({ viewMode: "grid", showHiddenFiles: false });
  });

  test("defaults to grid view mode", () => {
    expect(useLayoutStore.getState().viewMode).toBe("grid");
  });

  test("setViewMode changes the view mode", () => {
    useLayoutStore.getState().setViewMode("list");
    expect(useLayoutStore.getState().viewMode).toBe("list");
  });

  test("setViewMode accepts all valid modes", () => {
    const modes = ["list", "grid", "grid-compact", "tree"] as const;

    for (const mode of modes) {
      useLayoutStore.getState().setViewMode(mode);
      expect(useLayoutStore.getState().viewMode).toBe(mode);
    }
  });

  test("toggleShowHiddenFiles toggles the flag", () => {
    expect(useLayoutStore.getState().showHiddenFiles).toBe(false);

    useLayoutStore.getState().toggleShowHiddenFiles();
    expect(useLayoutStore.getState().showHiddenFiles).toBe(true);

    useLayoutStore.getState().toggleShowHiddenFiles();
    expect(useLayoutStore.getState().showHiddenFiles).toBe(false);
  });

  test("setHeaderSlot updates header slot", () => {
    useLayoutStore.getState().setHeaderSlot("test-header");
    expect(useLayoutStore.getState().headerSlot).toBe("test-header");
  });
});

/**
 * The persist middleware invokes the migrate function when the stored version
 * is older than the current version (3). We recreate the same migration record
 * used by the store to test each step directly via createMigrate.
 */
describe("useLayoutStore persist migrations", () => {
  interface PersistedLayoutState {
    viewMode: ViewMode;
    showHiddenFiles: boolean;
  }

  const fallback: PersistedLayoutState = {
    viewMode: "grid",
    showHiddenFiles: false,
  };

  // Reproduce the exact migration record from the store source.
  const migrate = createMigrate<PersistedLayoutState>(
    {
      0: (state) => {
        const s = state as { viewMode?: string };
        const OLD_VALID = [
          "list",
          "list-wide",
          "grid-sm",
          "grid-md",
          "grid-lg",
        ];
        return {
          viewMode: OLD_VALID.includes(s?.viewMode ?? "")
            ? (s.viewMode as string)
            : "grid",
        };
      },
      1: (state) => {
        const s = state as { viewMode?: string };
        const OLD_VALID = [
          "list",
          "list-wide",
          "grid-sm",
          "grid-md",
          "grid-lg",
        ];
        return {
          viewMode: OLD_VALID.includes(s?.viewMode ?? "")
            ? (s.viewMode as string)
            : "grid",
          showHiddenFiles: false,
        };
      },
      2: (state) => {
        const s = state as { viewMode?: string; showHiddenFiles?: boolean };
        const modeMap: Record<string, ViewMode> = {
          list: "list",
          "list-wide": "list",
          "grid-sm": "grid-compact",
          "grid-md": "grid",
          "grid-lg": "grid",
        };
        return {
          viewMode: modeMap[s?.viewMode ?? ""] ?? "grid",
          showHiddenFiles: s?.showHiddenFiles ?? false,
        };
      },
    },
    fallback,
  );

  describe("v0 -> v3 (full migration chain from earliest version)", () => {
    test("migrates list to list", () => {
      const result = migrate({ viewMode: "list" }, 0);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false });
    });

    test("migrates list-wide to list", () => {
      const result = migrate({ viewMode: "list-wide" }, 0);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false });
    });

    test("migrates grid-sm to grid-compact", () => {
      const result = migrate({ viewMode: "grid-sm" }, 0);
      expect(result).toEqual({
        viewMode: "grid-compact",
        showHiddenFiles: false,
      });
    });

    test("migrates grid-md to grid", () => {
      const result = migrate({ viewMode: "grid-md" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });

    test("migrates grid-lg to grid", () => {
      const result = migrate({ viewMode: "grid-lg" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });

    test("migrates unknown mode to grid (fallback)", () => {
      const result = migrate({ viewMode: "unknown-mode" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });

    test("migrates undefined viewMode to grid", () => {
      const result = migrate({}, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });

    test("migrates null state to grid", () => {
      const result = migrate(null, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });
  });

  describe("v2 -> v3 (most recent migration only)", () => {
    test("maps list to list", () => {
      const result = migrate({ viewMode: "list", showHiddenFiles: true }, 2);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: true });
    });

    test("maps list-wide to list", () => {
      const result = migrate({ viewMode: "list-wide", showHiddenFiles: false }, 2);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false });
    });

    test("maps grid-sm to grid-compact", () => {
      const result = migrate({ viewMode: "grid-sm", showHiddenFiles: false }, 2);
      expect(result).toEqual({
        viewMode: "grid-compact",
        showHiddenFiles: false,
      });
    });

    test("maps grid-md to grid", () => {
      const result = migrate({ viewMode: "grid-md", showHiddenFiles: true }, 2);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: true });
    });

    test("maps grid-lg to grid", () => {
      const result = migrate({ viewMode: "grid-lg", showHiddenFiles: false }, 2);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });

    test("preserves showHiddenFiles value during migration", () => {
      const result = migrate(
        { viewMode: "grid-sm", showHiddenFiles: true },
        2,
      );
      expect(result.showHiddenFiles).toBe(true);
    });

    test("defaults showHiddenFiles to false when missing", () => {
      const result = migrate({ viewMode: "list" }, 2);
      expect(result.showHiddenFiles).toBe(false);
    });

    test("falls back to grid for unrecognised mode string", () => {
      const result = migrate({ viewMode: "table" }, 2);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false });
    });
  });

  describe("v1 -> v3 (two-step migration)", () => {
    test("maps grid-sm through v1 and v2 to grid-compact", () => {
      const result = migrate({ viewMode: "grid-sm" }, 1);
      expect(result.viewMode).toBe("grid-compact");
    });

    test("adds showHiddenFiles in v1, then remaps mode in v2", () => {
      const result = migrate({ viewMode: "list-wide" }, 1);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false });
    });
  });

  describe("already at v3 (no migration needed)", () => {
    test("returns state unchanged", () => {
      const state = { viewMode: "tree" as const, showHiddenFiles: true };
      const result = migrate(state, 3);
      expect(result).toEqual(state);
    });
  });
});
