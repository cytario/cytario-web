import { create } from "zustand";
import { createJSONStorage, devtools, persist, type StateStorage } from "zustand/middleware";

import { createMigrate } from "~/utils/persistMigration";

export const TOUR_STORAGE_KEY = "cytario-tours";

interface TourUserProgress {
  completed: string[];
  lastSeenAt: string;
}

interface TourProgressState {
  /** Completed tour ids keyed by user `sub` — one profile per shared browser. */
  byUser: Record<string, TourUserProgress>;
  isComplete: (sub: string, tourId: string) => boolean;
  completeTour: (sub: string, tourId: string) => void;
  resetUser: (sub: string) => void;
}

interface PersistedTourProgress {
  byUser: Record<string, TourUserProgress>;
}

const name = TOUR_STORAGE_KEY;

/** A blocked or quota-exceeded localStorage must not crash tour bookkeeping. */
const safeLocalStorage: StateStorage = {
  getItem: (storageName) => {
    try {
      return localStorage.getItem(storageName);
    } catch {
      return null;
    }
  },
  setItem: (storageName, storageValue) => {
    try {
      localStorage.setItem(storageName, storageValue);
    } catch {
      // Progress stays in-memory; completion is just not durable.
    }
  },
  removeItem: (storageName) => {
    try {
      localStorage.removeItem(storageName);
    } catch {
      // ignore
    }
  },
};

export const useTourProgressStore = create<TourProgressState>()(
  persist(
    devtools(
      (set, get) => ({
        byUser: {},
        isComplete: (sub, tourId) => (get().byUser[sub]?.completed ?? []).includes(tourId),
        completeTour: (sub, tourId) =>
          set(
            (state) => {
              const user = state.byUser[sub] ?? { completed: [], lastSeenAt: "" };
              if (user.completed.includes(tourId)) return state;
              return {
                byUser: {
                  ...state.byUser,
                  [sub]: {
                    completed: [...user.completed, tourId],
                    lastSeenAt: new Date().toISOString(),
                  },
                },
              };
            },
            false,
            "completeTour",
          ),
        resetUser: (sub) =>
          set(
            (state) => {
              if (!state.byUser[sub]) return state;
              const byUser = { ...state.byUser };
              delete byUser[sub];
              return { byUser };
            },
            false,
            "resetUser",
          ),
      }),
      { name },
    ),
    {
      name,
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state): PersistedTourProgress => ({ byUser: state.byUser }),
      migrate: createMigrate<PersistedTourProgress>(
        {
          0: (state) => {
            const persisted = (state ?? {}) as { byUser?: Record<string, TourUserProgress> };
            return { byUser: persisted.byUser ?? {} };
          },
        },
        { byUser: {} },
      ),
    },
  ),
);
