# UI Issues in @cytario/design

Open issues found in cytario-web after migrating to `@cytario/design`. Each issue describes the root cause and what's needed from the design system.

---

## 1. Styled Tab/TabList/Tabs Conflict with Custom Tab Rendering

**Component:** `Tab`, `TabList`, `Tabs`

**Context:** The image viewer's preset selector uses 4 tab buttons with fully custom rendering — gradient backgrounds based on active channel colors, number badges, and overlay indicator dots. It imports `Tab`, `TabList`, `Tabs` from `@cytario/design` for the selection semantics.

**Problem:** The design system's `Tab` component applies its own className via a render function that sets text colors, backgrounds, hover/selected states, padding, and font weights. These styles conflict with the custom rendering because:

1. The design system uses `.join(" ")` (not `twMerge`) to merge its internal styles with the consumer's `className`. Both class lists end up in the DOM and Tailwind's CSS generation order determines which wins — not the order in the class attribute.
2. Specifically, the Tab applies `text-[var(--color-text-secondary)]` (unselected) and `text-[var(--color-teal-700)]` (selected) which override the custom text colors.
3. The pills variant adds `bg-[var(--color-surface-default)]` (selected) and `bg-transparent` (unselected) backgrounds that fight with the custom gradient backgrounds.

**Impact:** The preset tabs are nearly invisible — text blends into the background because the design system's text color wins over the custom one.

**Why a workaround is not appropriate:** Importing raw `react-aria-components` primitives works but defeats the purpose of the migration. The design system should support this use case directly.

**Suggested design system fix:**

1. **Use `twMerge` for className composition in `Tab`** (same pattern already applied to `Heading`, `Button`, `ToggleButton`). This lets consumers override any style via `className` without conflicts.
2. **Add an `unstyled` variant** (or `variant="custom"`) to `Tab` that provides only the accessibility/selection semantics with no visual styles — similar to how `RadioGroup`/`Radio` differ from their unstyled RAC counterparts. This is useful when consumers need full control over rendering but still want the design system's API surface.
3. **Re-export the raw RAC primitives** (e.g., `export { Tabs as UnstyledTabs, Tab as UnstyledTab, TabList as UnstyledTabList } from "react-aria-components"`) so consumers don't need a direct `react-aria-components` dependency for unstyled use cases.

---

## 2. Dark Theme CSS Not Exported

**Component:** Token CSS files

**Problem:** The design system generates `variables-dark.css` with `[data-theme="dark"]` token overrides, but the package.json `exports` map only exposes `./tokens/variables.css` (light theme). Consumers cannot import the dark theme tokens via the package specifier.

**Impact:** Any consumer that needs dark-themed design system components (e.g., an image viewer with a dark sidebar) cannot use `data-theme="dark"` without reaching into the package's internal file structure.

**Suggested design system fix:**

1. Add `"./tokens/variables-dark.css": "./src/tokens/variables-dark.css"` to the `exports` map in `package.json`
2. Add `"src/tokens/variables-dark.css"` to the `files` array
3. Alternatively, bundle the dark tokens into `variables.css` so a single import provides both themes

---

## 3. Directory Imports in Compiled Output

**Component:** Package build output (`dist/`)

**Problem:** The compiled `dist/index.js` uses directory imports (e.g., `./components/Button` instead of `./components/Button/index.js`). Node.js ESM does not support directory imports — they are a CJS-only convention.

**Impact:** Any consumer using Vite SSR (or any Node.js ESM environment) gets `ERR_UNSUPPORTED_DIR_IMPORT` unless they add `@cytario/design` to `ssr.noExternal` in their Vite config, forcing Vite to bundle it through its transform pipeline.

**Suggested design system fix:**

1. Set `"moduleResolution": "nodenext"` and `"module": "nodenext"` in `tsconfig.build.json` — TypeScript will then require and preserve explicit `.js` extensions in import paths
2. Or use a bundler (e.g., `tsup`, `rollup`) that rewrites directory imports to include `/index.js` in the output
