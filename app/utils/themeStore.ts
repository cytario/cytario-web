import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
  /** Global UI theme applied to the document root. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const STORAGE_KEY = "cytario-theme";

/** The value rendered before hydration — matches the inline boot script in
 * root.tsx so SSR and the pre-paint script agree on the default. */
export const DEFAULT_THEME: Theme = "dark";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    { name: STORAGE_KEY, storage: createJSONStorage(() => localStorage) },
  ),
);
