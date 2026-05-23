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
    const modes = ["list", "grid", "tree"] as const;

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
 * is older than the current version (5). We recreate the same migration record
 * used by the store to test each step directly via createMigrate.
 */
describe("useLayoutStore persist migrations", () => {
  interface PersistedLayoutState {
    viewMode: ViewMode;
    showHiddenFiles: boolean;
    showFilters: boolean;
  }

  const fallback: PersistedLayoutState = {
    viewMode: "grid",
    showHiddenFiles: false,
    showFilters: false,
  };

  // Reproduce the exact migration record from the store source.
  const migrate = createMigrate<PersistedLayoutState>(
    {
      0: (state) => {
        const s = state as { viewMode?: string };
        const OLD_VALID = ["list", "list-wide", "grid-sm", "grid-md", "grid-lg"];
        return {
          viewMode: OLD_VALID.includes(s?.viewMode ?? "") ? (s.viewMode as string) : "grid",
          showHiddenFiles: false,
          showFilters: false,
        };
      },
      1: (state) => {
        const s = state as { viewMode?: string };
        const OLD_VALID = ["list", "list-wide", "grid-sm", "grid-md", "grid-lg"];
        return {
          viewMode: OLD_VALID.includes(s?.viewMode ?? "") ? (s.viewMode as string) : "grid",
          showHiddenFiles: false,
          showFilters: false,
        };
      },
      2: (state) => {
        const s = state as { viewMode?: string; showHiddenFiles?: boolean };
        const modeMap: Record<string, string> = {
          list: "list",
          "list-wide": "list",
          "grid-sm": "grid",
          "grid-md": "grid",
          "grid-lg": "grid",
        };
        return {
          viewMode: (modeMap[s?.viewMode ?? ""] ?? "grid") as ViewMode,
          showHiddenFiles: s?.showHiddenFiles ?? false,
          showFilters: false,
        };
      },
      3: (state) => {
        const s = state as { viewMode?: string; showHiddenFiles?: boolean };
        return {
          viewMode: (s?.viewMode === "grid-compact" ? "grid" : (s?.viewMode ?? "grid")) as ViewMode,
          showHiddenFiles: s?.showHiddenFiles ?? false,
          showFilters: false,
        };
      },
      4: (state) => {
        const s = state as {
          viewMode?: string;
          showHiddenFiles?: boolean;
          showFilters?: boolean;
        };
        return {
          viewMode: (s?.viewMode === "grid-compact" ? "grid" : (s?.viewMode ?? "grid")) as ViewMode,
          showHiddenFiles: s?.showHiddenFiles ?? false,
          showFilters: s?.showFilters ?? false,
        };
      },
    },
    fallback,
  );

  describe("v0 -> v5 (full migration chain from earliest version)", () => {
    test("migrates list to list", () => {
      const result = migrate({ viewMode: "list" }, 0);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false, showFilters: false });
    });

    test("migrates list-wide to list", () => {
      const result = migrate({ viewMode: "list-wide" }, 0);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false, showFilters: false });
    });

    test("migrates grid-sm to grid", () => {
      const result = migrate({ viewMode: "grid-sm" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });

    test("migrates grid-md to grid", () => {
      const result = migrate({ viewMode: "grid-md" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });

    test("migrates grid-lg to grid", () => {
      const result = migrate({ viewMode: "grid-lg" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });

    test("migrates unknown mode to grid (fallback)", () => {
      const result = migrate({ viewMode: "unknown-mode" }, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });

    test("migrates undefined viewMode to grid", () => {
      const result = migrate({}, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });

    test("migrates null state to grid", () => {
      const result = migrate(null, 0);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });
  });

  describe("v3 -> v5 (grid-compact removal)", () => {
    test("maps grid-compact to grid", () => {
      const result = migrate({ viewMode: "grid-compact", showHiddenFiles: false }, 3);
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: false, showFilters: false });
    });

    test("preserves existing modes through v3+", () => {
      const result = migrate({ viewMode: "tree", showHiddenFiles: true }, 3);
      expect(result).toEqual({ viewMode: "tree", showHiddenFiles: true, showFilters: false });
    });
  });

  describe("v4 -> v5 (showFilters preserved, grid-compact still remapped)", () => {
    test("maps grid-compact to grid", () => {
      const result = migrate(
        { viewMode: "grid-compact", showHiddenFiles: true, showFilters: true },
        4,
      );
      expect(result).toEqual({ viewMode: "grid", showHiddenFiles: true, showFilters: true });
    });

    test("preserves all three flags otherwise", () => {
      const state = { viewMode: "list", showHiddenFiles: false, showFilters: true };
      const result = migrate(state, 4);
      expect(result).toEqual({ viewMode: "list", showHiddenFiles: false, showFilters: true });
    });
  });

  describe("already at v5 (no migration needed)", () => {
    test("returns state unchanged", () => {
      const state = { viewMode: "tree" as const, showHiddenFiles: true, showFilters: false };
      const result = migrate(state, 5);
      expect(result).toEqual(state);
    });
  });
});
