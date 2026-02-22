# Migrating cytario-web to @cytario/design

**Date:** 2026-02-21
**Author:** Principal Frontend Engineer
**Status:** Reviewed (Architecture, Frontend, Security, QA)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Installation](#2-installation)
3. [Migration Strategy](#3-migration-strategy)
4. [Component Mapping Table](#4-component-mapping-table)
5. [Per-Component Migration Instructions](#5-per-component-migration-instructions)
6. [Components Staying in cytario-web](#6-components-staying-in-cytario-web)
7. [Token Migration](#7-token-migration)
8. [Form Integration with react-hook-form](#8-form-integration-with-react-hook-form)
9. [Toast Migration](#9-toast-migration)
10. [Testing Migration](#10-testing-migration)
11. [Migration Checklist](#11-migration-checklist)
12. [Architectural Review Notes](#architectural-review-notes)
13. [Frontend Engineering Review Notes](#frontend-engineering-review-notes)
14. [Security Review Notes](#security-review-notes)

---

## 1. Overview

### What This Migration Is

This guide covers the incremental replacement of cytario-web's hand-built component library (Headless UI v2 + Tailwind v3) with the `@cytario/design` package -- cytario's shared design system built on React Aria Components + Tailwind v4 + W3C DTCG design tokens.

### Why We Are Doing This

1. **Single source of truth.** Colors, spacing, typography, and component behavior are defined once in the design system and consumed by every product. No more hardcoded Tailwind classes drifting across repos.

2. **Accessibility.** Every `@cytario/design` component is built on React Aria Components (Adobe), which provides best-in-class WAI-ARIA patterns, keyboard navigation, screen reader support, and internationalization. This replaces the current mix of Headless UI and custom implementations.

3. **Visual consistency.** Components use design tokens (CSS custom properties) instead of hardcoded colors. The current codebase mixes `gray-*` and `slate-*` scales, has inconsistent border treatments, and lacks a token system.

4. **Regulatory posture.** For IEC 62304 SOUP documentation, consolidating from Headless UI + custom implementations to a single dependency (`react-aria-components`) with clear semantic versioning reduces the SOUP surface area.

### Key Architectural Change

The most significant change is the **headless UI library swap**:

| | cytario-web (current) | @cytario/design (target) |
|---|---|---|
| Headless primitives | Headless UI v2 (Tailwind Labs) | React Aria Components (Adobe) |
| Styling | Tailwind v3 + `tailwind-merge` | Tailwind v4 + design token CSS custom properties |
| Form integration | React Hook Form + Headless UI Field | React Hook Form + `Field` component |
| State patterns | Zustand (notifications) | React Context (ToastProvider) |

React Aria and Headless UI have **completely different APIs**. This is not a find-and-replace migration -- each component needs careful attention to prop mapping, event handling, and state management.

---

## 2. Installation

### Step 1: Add the package

```bash
npm install @cytario/design
```

The package is published to GitHub Packages. Ensure your `.npmrc` is configured:

```
@cytario:registry=https://npm.pkg.github.com
```

### Step 2: Peer dependencies

`@cytario/design` has the following peer dependencies:

| Package | Requirement | cytario-web has |
|---|---|---|
| `react` | 19.x | 19.2.0 -- OK |
| `react-dom` | 19.x | 19.2.0 -- OK |
| `lucide-react` | >=0.400.0 (optional) | 0.462.0 -- OK |

The `react-aria-components` dependency (1.15.1) is bundled inside `@cytario/design` -- do **not** install it separately.

### Step 3: Import the token CSS

Add the design token stylesheet to your root layout. This provides all CSS custom properties (`--color-*`, `--spacing-*`, `--font-*`, etc.) that the components depend on.

```tsx
// app/root.tsx
import "@cytario/design/tokens/variables.css";
```

This import must come **before** your application styles so that token values are available for any Tailwind classes or component styles that reference them.

The design system's token CSS is wrapped in `@layer cytario-design`. This means:

- **Consumer Tailwind v3 utilities (unlayered) automatically override design system defaults** -- no `!important` needed for `className` overrides.
- The expected CSS load order is: design system tokens CSS -> design system component CSS -> app Tailwind CSS.
- Any `className` prop you pass to a design system component will win over the component's built-in styles because unlayered styles always beat layered styles in the CSS cascade.

### Step 3a: `"use client"` directive -- no action needed

`@cytario/design` ships with `"use client"` at its entry point. No additional configuration is needed for React Router v7 SSR -- the framework bundler will automatically treat all design system imports as client-only code. You do not need to add `"use client"` to your own files when importing from `@cytario/design`.

### Step 4: Do NOT remove Headless UI yet

During the incremental migration, both libraries will coexist. Headless UI stays installed until every component using it has been migrated. Removing it prematurely will break unmigrated components.

```
# Remove ONLY after all migrations are complete:
npm uninstall @headlessui/react
```

---

## 3. Migration Strategy

### Incremental, Not Big-Bang

Migrate one component at a time. Merge each component migration as its own PR. This approach:

- Keeps PRs reviewable (each touches ~3-5 files)
- Lets you catch regressions immediately
- Allows the team to share the work across sprints

### Recommended Order

Start with **prerequisites**, then **leaf components** that have no dependencies on other custom components, then work upward:

```
Phase 0: Prerequisites (MUST complete before any component migration)
  1. Verify className overrides work on design system components (empirical test)
  2. Set up RouterProvider (from @cytario/design) in root for React Aria routing integration
  3. Add ToastProvider with createToastBridge() to root

Phase 1: Foundation (no dependents)
  Icon (migrate first — prerequisite for IconButton, EmptyState, etc.)
  Button -> IconButton -> Input -> Checkbox -> Switch -> Radio

Phase 2: Form infrastructure
  Field -> Fieldset -> InputGroup -> Select
  Image Viewer: MinMaxSettings (Field/Label), ChannelsControllerItemList (RadioGroup),
    ChannelsControllerItem (Radio), OverlaysController.Item (RadioGroup — misuse, replace with <div>)

Phase 3: Feedback and overlay
  Dialog -> Toast -> EmptyState -> Spinner
  Image Viewer: ColorPicker (Popover)
  GlobalSearch: Suggestions (Transition -> motion)

Phase 4: Navigation + compound
  Link -> ButtonLink / IconButtonLink -> Breadcrumbs -> Menu -> Heading (H1/H2/H3)
  ToggleButton
  Tabs (now in @cytario/design — replaces Headless UI TabGroup)
  Image Viewer: Presets (Tab/TabGroup/TabList), ChannelsController (TabPanel/TabPanels)

Phase 5: Cleanup — full Headless UI removal
  Remove old components, portal nodes, uninstall @headlessui/react, audit token adoption
```

> **Tailwind v3 → v4 is NOT included in this migration.** It affects 95 files with an orthogonal blast radius. It should be a separate follow-up effort once Headless UI migration has a green test suite.

### Coexistence During Migration

During the transition period, you will have both Headless UI components and `@cytario/design` components in the same render tree. This is fine -- they do not conflict at the CSS or DOM level. The risks to manage:

- **Bundle size inflation** from shipping both `@headlessui/react` and `react-aria-components` temporarily.
- **CSS specificity**: The design system ships pre-compiled CSS wrapped in `@layer cytario-design`. App-level Tailwind v3 utilities (unlayered) always win when overriding via `className`. No `!important` needed. Load order: design system tokens CSS -> design system component CSS -> app Tailwind CSS.
- **Dual tooltip portals**: old tooltips portal to `#tooltip` div, design system tooltips portal to `document.body`. z-index conflicts are possible (both use `z-50`).
- **Dual notification positions**: old notifications render top-center, design system toasts render bottom-right. Migrate all callsites in a single PR to avoid showing notifications in two locations simultaneously.

### `react-aria-components` Imports

`react-aria-components` is bundled inside `@cytario/design`. Always import `RouterProvider` and the `Key` type from the design system package -- never from `react-aria-components` directly, which would create a separate React context tree:

```tsx
// CORRECT
import { RouterProvider } from "@cytario/design";
import type { Key } from "@cytario/design";

// WRONG — dual context tree; design system components will not see the router
import { RouterProvider } from "react-aria-components";
```

The `Key` type is useful for typing `onSelectionChange` handlers on `Select`, `Tabs`, and similar components.

### Rollback Strategy

Each phase is a separate PR (or set of PRs). The implicit rollback strategy is `git revert`. For the Toast migration (Phase 3), which touches many files, consider a feature flag:

```tsx
const USE_DESIGN_SYSTEM_TOASTS = true; // flip to false to rollback
```

---

## 4. Component Mapping Table

| cytario-web Component | @cytario/design Equivalent | Status | Notes |
|---|---|---|---|
| `Button` | `Button` | Direct replacement | Prop rename: `theme` -> `variant`, `scale` -> `size` |
| `IconButton` | `IconButton` | Direct replacement | Prop rename: `label` -> `aria-label`, `scale` -> `size` |
| `ButtonLink` | `ButtonLink` | Direct replacement | Uses React Aria `Link` instead of react-router `Link` |
| `IconButtonLink` | `IconButtonLink` | Direct replacement | Same as ButtonLink |
| `Input` | `Input` | Direct replacement | Built-in label/error. Prop rename: `scale` -> `size` |
| `Select` | `Select` | Partial replacement | Custom dropdown replaces native `<select>` |
| `Checkbox` | `Checkbox` | Direct replacement | React Aria replaces Headless UI |
| `Switch` | `Switch` | Partial replacement | `color` prop accepts preset strings, not arbitrary CSS colors |
| `Radio` / `RadioButton` | `Radio` / `RadioButton` | Direct replacement | Wrapped in `RadioGroup` |
| `Label` | `Label` | Direct replacement | React Aria Label |
| `Field` | `Field` | Direct replacement | Accepts `error` as string or `{ message }` object |
| `Fieldset` | `Fieldset` | Direct replacement | Uses native `<fieldset>`, not Headless UI |
| `InputGroup` | `InputGroup` | Direct replacement | Same visual joining pattern |
| `Tooltip` | `Tooltip` | Partial replacement | React Aria Tooltip (positioned, not mouse-follow) |
| `TooltipSpan` | -- | Stays in cytario-web | No design system equivalent |
| `RouteModal` | `Dialog` | Partial replacement | URL-driven behavior stays in cytario-web |
| `NotificationList` | `ToastProvider` + `useToast` | Direct replacement | Replaces Zustand store |
| `H1` / `H2` / `H3` | `H1` / `H2` / `H3` | Direct replacement | Token-based sizing |
| `Link` | `Link` | Direct replacement | React Aria Link, not react-router Link |
| `Breadcrumbs` | `Breadcrumbs` | Partial replacement | Data-driven API (`items` array) |
| `UserMenu` | `Menu` | Direct replacement | Data-driven API (`items` array) |
| `Placeholder` | `EmptyState` | Direct replacement | Prop rename: `icon` string -> Lucide component, `cta` -> `action` |
| `LavaLoader` | `Spinner` | Partial replacement | Simple spinner, not animated dot grid |
| `ToggleButton` (ViewModeToggle) | `ToggleButton` | Direct replacement | React Aria ToggleButton |
| `TabGroup` / `Tab` / `TabList` / `TabPanel` | `Tabs` / `Tab` / `TabList` / `TabPanel` | Direct replacement | `selectedIndex`/`onChange` -> `selectedKey`/`onSelectionChange` (string keys); `TabPanels` wrapper removed |
| `Table` | -- | Stays in cytario-web | TanStack Table with virtualization; apply tokens only |
| `DataGrid` | -- | Stays in cytario-web | TanStack Table + Virtual |
| `FormWizard` | -- | Stays in cytario-web | App-specific multi-step pattern |
| `Logo` | -- | Stays in cytario-web | Animated SVG, app-specific |
| `Section` / `Container` / `Footer` | -- | Stays in cytario-web | Layout primitives, app-specific |
| `ClientOnly` | -- | Stays in cytario-web | SSR utility |
| `DirectoryView` (all) | -- | Stays in cytario-web | Domain-specific file browser |
| Image Viewer (all) | -- | Stays in cytario-web | Domain-specific microscopy viewer |
| `GlobalSearch` | -- | Stays in cytario-web | App-specific search |
| `DescriptionList` | -- | Stays in cytario-web | Simple `<dl>` wrapper |
| `Icon` (string-based) | `Icon` (component-based) | Breaking change | See Icon section below |

---

## 5. Per-Component Migration Instructions

### 5.1 Button

The most-used component. The design system Button wraps React Aria's `Button` with token-based styling.

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `theme` | `variant` | Value mapping below |
| `scale` | `size` | `"small"` -> `"sm"`, `"medium"` -> `"md"`, `"large"` -> `"lg"` |
| `onClick` | `onPress` | React Aria uses `onPress` (fires on click, Enter, Space) |
| `disabled` | `isDisabled` | React Aria naming convention |
| `type` | `type` | Same |
| `className` | `className` | Same |
| -- | `isLoading` | New: shows spinner, disables button |
| -- | `iconLeft` | New: Lucide component rendered before children |
| -- | `iconRight` | New: Lucide component rendered after children |

**Variant mapping:**

| cytario-web `theme` | @cytario/design `variant` |
|---|---|
| `"default"` | `"default"` |
| `"primary"` | `"primary"` |
| `"error"` | `"destructive"` |
| `"success"` | `"success"` |
| `"info"` | `"info"` |
| `"transparent"` | `"ghost"` |
| `"white"` | `"secondary"` |

**Before:**

```tsx
import { Button } from "~/components/Controls";

<Button theme="primary" scale="large" onClick={handleSave} disabled={isPending}>
  Save
</Button>
```

**After:**

```tsx
import { Button } from "@cytario/design";

<Button variant="primary" size="lg" onPress={handleSave} isDisabled={isPending}>
  Save
</Button>
```

**With loading state (new capability):**

```tsx
<Button variant="primary" size="lg" isLoading={isPending}>
  Save
</Button>
```

**Breaking changes:**

- `onClick` becomes `onPress`. React Aria's `onPress` fires consistently across mouse, touch, keyboard (Enter/Space), and assistive technology. It does **not** receive a native `MouseEvent` -- it receives a `PressEvent`. If you need the native event (rare), use `onPressStart` or `onPressEnd`.
- The 3D bevel border effect (`border-t-*-300` / `border-b-*-900`) is removed. The design system uses flat token-based colors.
- `type="submit"` works the same way but note that React Aria buttons use `type="button"` by default (same as Headless UI).

### 5.2 IconButton

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `icon` | `icon` | Was string (`"X"`), now Lucide component (`X`) |
| `label` | `aria-label` | Required prop, also used as tooltip text |
| `theme` | `variant` | Same mapping as Button |
| `scale` | `size` | Same mapping as Button |
| `onClick` | `onPress` | React Aria press event |
| `disabled` | `isDisabled` | React Aria naming |
| -- | `showTooltip` | Default `true`. Set `false` to suppress tooltip |
| -- | `tooltipPlacement` | `"top"` (default), `"bottom"`, `"left"`, `"right"` |
| -- | `isLoading` | Shows spinner instead of icon |

**Before:**

```tsx
import { IconButton } from "~/components/Controls";

<IconButton icon="X" label="Close" theme="transparent" scale="small" onClick={onClose} />
```

**After:**

```tsx
import { IconButton } from "@cytario/design";
import { X } from "lucide-react";

<IconButton icon={X} aria-label="Close" variant="ghost" size="sm" onPress={onClose} />
```

**Breaking change:** The `icon` prop no longer accepts a string key. You must import the Lucide component directly. This enables tree-shaking -- the current cytario-web `Icon` component imports the entire Lucide icon set.

### 5.3 Input

The design system Input wraps React Aria's `TextField` and includes optional label, description, and error message.

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `scale` | `size` | `"small"` -> `"sm"`, `"medium"` -> `"md"`, `"large"` -> `"lg"` |
| `theme` | -- | Removed. No dark/light mode prop; use CSS token themes instead |
| `prefix` | `prefix` | Same behavior |
| `align` | `align` | Same behavior |
| `disabled` | `isDisabled` | React Aria naming |
| `required` | `isRequired` | React Aria naming; renders `*` indicator |
| `onChange` | `onChange` | Same (standard input event) |
| -- | `label` | New: renders label above input |
| -- | `description` | New: renders help text below input |
| -- | `errorMessage` | New: renders error text, triggers error border |

**Before:**

```tsx
import { Field, Input } from "~/components/Controls";

<Field label="Bucket name" error={errors.name}>
  <Input
    scale="large"
    prefix="s3://"
    {...register("name")}
  />
</Field>
```

**After (option A -- using Input's built-in label):**

```tsx
import { Input } from "@cytario/design";

<Input
  label="Bucket name"
  size="lg"
  prefix="s3://"
  errorMessage={errors.name?.message}
  {...register("name")}
/>
```

**After (option B -- using standalone Field for complex layouts):**

```tsx
import { Field, Input } from "@cytario/design";

<Field label="Bucket name" error={errors.name}>
  <Input
    size="lg"
    prefix="s3://"
    {...register("name")}
  />
</Field>
```

**Breaking changes:**

- The `theme` prop (`"dark"` / `"light"`) is removed. Dark mode should be handled via CSS token themes at the layout level, not per-component.
- Native `InputHTMLAttributes` are partially supported via React Aria's `TextFieldProps`. Verify that any exotic attributes you spread still work.

### 5.4 Checkbox

**Before:**

```tsx
import { Checkbox } from "@headlessui/react";
import { Check } from "lucide-react";

<Checkbox
  checked={value}
  onChange={onChange}
  className="group size-6 rounded border ..."
>
  <Check className="hidden group-data-[checked]:block size-4 text-cytario-turquoise-500" />
</Checkbox>
```

**After:**

```tsx
import { Checkbox } from "@cytario/design";

<Checkbox isSelected={value} onChange={onChange}>
  Optional label text
</Checkbox>
```

**Prop mapping:**

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `checked` | `isSelected` | React Aria naming |
| `onChange` | `onChange` | Same signature: `(isSelected: boolean) => void` |
| `disabled` | `isDisabled` | React Aria naming |
| `name` | `name` | Same |

**Breaking changes:**

- The check mark is built into the component. You no longer render the icon yourself.
- Indeterminate state is supported via `isIndeterminate` prop.
- The checked color uses `--color-action-primary` (teal) by default, matching the current turquoise-500 usage.

### 5.5 Switch

**Before:**

```tsx
import { Switch } from "@headlessui/react";

<Switch
  checked={isEnabled}
  onChange={setIsEnabled}
  className={`${isEnabled ? "bg-cytario-turquoise-500" : "bg-slate-300"} relative inline-flex h-5 w-9 ...`}
>
  <span className={`${isEnabled ? "translate-x-4" : "translate-x-0"} inline-block h-4 w-4 ...`} />
</Switch>
```

**After:**

```tsx
import { Switch } from "@cytario/design";

<Switch isSelected={isEnabled} onChange={setIsEnabled}>
  Optional label text
</Switch>
```

**Prop mapping:**

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `checked` | `isSelected` | React Aria naming |
| `onChange` | `onChange` | Signature change: current wrapper types as `() => void`; design system passes `(isSelected: boolean) => void`. Callers using toggle patterns may need minor updates. |
| `disabled` | `isDisabled` | React Aria naming |
| `color` (CSS string) | `color` (preset) | `"primary"`, `"success"`, or `"destructive"` |

**Breaking change:** The current Switch in the image viewer accepts an arbitrary CSS color string for the track (used for channel colors like `#FF0000`). The design system Switch only accepts preset values (`"primary"`, `"success"`, `"destructive"`). For the channel controller, either:

1. Keep the custom Switch in the image viewer (recommended -- it is domain-specific), or
2. Use the `className` prop to override the track color with an inline style.

### 5.6 Radio / RadioButton

**Before:**

```tsx
import { RadioGroup, Radio } from "@headlessui/react";

<RadioGroup value={selected} onChange={setSelected}>
  <Radio value="aws">
    {({ checked }) => (
      <div className={`${checked ? "bg-cytario-turquoise-500 text-white" : "bg-white"} ...`}>
        AWS
      </div>
    )}
  </Radio>
</RadioGroup>
```

**After (dot-style radio):**

```tsx
import { RadioGroup, Radio } from "@cytario/design";

<RadioGroup value={selected} onChange={setSelected}>
  <Radio value="aws">AWS</Radio>
  <Radio value="gcs">Google Cloud</Radio>
</RadioGroup>
```

**After (button-style radio -- for form wizard provider selection):**

```tsx
import { RadioGroup, RadioButton } from "@cytario/design";

<RadioGroup value={selected} onChange={setSelected}>
  <RadioButton value="aws">AWS</RadioButton>
  <RadioButton value="gcs">Google Cloud</RadioButton>
</RadioGroup>
```

**Prop mapping:**

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `RadioGroup value` | `RadioGroup value` | Same |
| `RadioGroup onChange` | `RadioGroup onChange` | Same |
| `Radio value` | `Radio value` / `RadioButton value` | Same |
| `Radio disabled` | `Radio isDisabled` | React Aria naming |

**Breaking change:** Headless UI Radio uses a render function `({ checked }) => ...` for conditional styling. In `@cytario/design`, styling is built in -- you just pass children as text. If you need custom render content inside a Radio, use `className` to extend.

### 5.7 Select

This is one of the bigger changes. The current cytario-web Select wraps a native `<select>` element via Headless UI. The design system Select uses a React Aria custom dropdown with a Popover, ListBox, and keyboard navigation.

**Before:**

```tsx
import { Select } from "~/components/Controls";

<Select {...register("region")}>
  <option value="">Select a region</option>
  <option value="us-east-1">US East (N. Virginia)</option>
  <option value="eu-west-1">EU (Ireland)</option>
</Select>
```

**After:**

```tsx
import { Select } from "@cytario/design";

const regions = [
  { id: "us-east-1", name: "US East (N. Virginia)" },
  { id: "eu-west-1", name: "EU (Ireland)" },
];

<Select
  label="Region"
  items={regions}
  placeholder="Select a region"
  selectedKey={value}
  onSelectionChange={(key) => onChange(key)}
  errorMessage={errors.region?.message}
/>
```

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `children` (`<option>`) | `items` (array of `{ id, name }`) | Data-driven, not render-driven |
| -- | `label` | Required label text |
| -- | `placeholder` | Default: `"Select an option"` |
| -- | `selectedKey` | Controlled selection |
| -- | `onSelectionChange` | `(key: Key) => void` |
| -- | `errorMessage` | Error text below trigger |
| `disabled` | `isDisabled` | React Aria naming |
| `required` | `isRequired` | React Aria naming |

**Breaking changes:**

- No more `<option>` children. Items are passed as a data array.
- The native `<select>` is replaced by a custom dropdown. Mobile behavior changes -- no native picker sheet on iOS/Android.
- `register()` from react-hook-form does not work directly. See the [Form Integration](#8-form-integration-with-react-hook-form) section.

### 5.8 Dialog

The design system provides a controlled `Dialog` component. The current cytario-web `RouteModal` wraps Headless UI Dialog and is always open (closes by navigation). You will likely create a thin wrapper in cytario-web that combines `Dialog` with route-based open/close logic.

**Before:**

```tsx
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";

<Dialog open={true} onClose={navigateBack}>
  <DialogBackdrop className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
  <div className="fixed inset-0 flex items-center justify-center">
    <DialogPanel className="max-w-lg bg-white rounded-lg ...">
      <DialogTitle className="text-lg font-semibold ...">
        {title}
      </DialogTitle>
      <button onClick={navigateBack}><X size={20} /></button>
      <div>{children}</div>
    </DialogPanel>
  </div>
</Dialog>
```

**After:**

```tsx
import { Dialog } from "@cytario/design";

<Dialog
  isOpen={true}
  onOpenChange={(isOpen) => { if (!isOpen) navigateBack(); }}
  title={title}
  size="md"
>
  {children}
</Dialog>
```

**Prop mapping:**

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `open` | `isOpen` | Controlled boolean |
| `onClose` | `onOpenChange` | `(isOpen: boolean) => void` -- fires with `false` on dismiss |
| `DialogTitle` (children) | `title` (string prop) | Title is a prop, not a child component |
| -- | `size` | `"sm"`, `"md"`, `"lg"`, `"xl"` |

**Size mapping:**

| @cytario/design `size` | Max width |
|---|---|
| `"sm"` | `max-w-md` (28rem) |
| `"md"` | `max-w-lg` (32rem) -- matches current RouteModal |
| `"lg"` | `max-w-2xl` (42rem) |
| `"xl"` | `max-w-4xl` (56rem) |

**Breaking changes:**

- Backdrop, panel, and close button are all built in. No need to compose these yourself.
- The Dialog includes enter/exit animations (fade + zoom).
- `isDismissable` is enabled by default (click backdrop or press Escape to close).
- The close button (`X`) is built in. Remove your manual close button.

**RouteModal migration pattern:**

Create a thin wrapper in cytario-web that keeps the URL-driven behavior:

```tsx
// app/components/RouteModal.tsx
import { Dialog } from "@cytario/design";
import { useNavigate } from "react-router";

export function RouteModal({ title, children, size, onClose }: {
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  onClose?: () => void;
}) {
  const navigate = useNavigate();
  const handleClose = onClose ?? (() => navigate(-1));
  return (
    <Dialog
      isOpen={true}
      onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}
      title={title}
      size={size}
    >
      {children}
    </Dialog>
  );
}
```

> **SSR note:** React Aria `Dialog` uses `OverlayContainer` which only renders client-side (portals to `document.body`). Route-driven modals that are always open may flash during hydration since the current Headless UI Dialog renders inline during SSR. Consider adding a CSS transition to mask the flash, or rendering content inline with a client-side portal upgrade.

### 5.9 Tooltip

**Before (custom mouse-follow implementation):**

```tsx
import { Tooltip } from "~/components/Tooltip/Tooltip";

<Tooltip content="Download file">
  <button>...</button>
</Tooltip>
```

**After:**

```tsx
import { Tooltip } from "@cytario/design";

<Tooltip content="Download file" placement="top">
  <Button ...>...</Button>
</Tooltip>
```

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `content` | `content` | Same prop name; current accepts `ReactNode`, verify design system does too |
| -- | `placement` | `"top"` (default), `"bottom"`, `"left"`, `"right"` |
| -- | `delay` | Default 500ms (same as current) |

**Breaking changes:**

- The design system Tooltip uses React Aria's positioning system. It does **not** follow the mouse. It anchors to the trigger element and appears at the specified `placement`.
- The tooltip is rendered in a React Aria overlay, not a manual portal to `#tooltip`.
- The glassmorphism style (`bg-black/80 backdrop-blur-sm`) is similar but uses `bg-neutral-950/80`.
- **`TooltipSpan` has no equivalent.** The auto-tooltip-on-truncation behavior is specific to cytario-web and should remain there. You can use the design system Tooltip as its underlying implementation if desired.

### 5.10 EmptyState (Placeholder)

**Before:**

```tsx
import { Placeholder } from "~/components/Placeholder";

<Placeholder
  icon="FileSearch"
  title="No files found"
  description="Upload files to get started"
  cta={<Button theme="primary" scale="medium" onClick={onUpload}>Upload</Button>}
/>
```

**After:**

```tsx
import { EmptyState, Button } from "@cytario/design";
import { FileSearch } from "lucide-react";

<EmptyState
  icon={FileSearch}
  title="No files found"
  description="Upload files to get started"
  action={<Button variant="primary" onPress={onUpload}>Upload</Button>}
/>
```

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `icon` (string) | `icon` (LucideIcon component) | Import Lucide component directly |
| `title` | `title` | Same |
| `description` | `description` | Same |
| `cta` (ReactNode prop) | `action` (ReactNode prop) | Prop rename: `cta` -> `action` |

### 5.11 Heading (H1 / H2 / H3)

**Before:**

```tsx
import { H1, H2, H3 } from "~/components/Fonts";

<H1>Dashboard</H1>
<H2>Recent projects</H2>
<H3 className="text-slate-600">Section title</H3>
```

**After:**

```tsx
import { H1, H2, H3 } from "@cytario/design";

<H1>Dashboard</H1>
<H2>Recent projects</H2>
<H3 className="text-slate-600">Section title</H3>
```

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `children` | `children` | Same |
| `className` | `className` | Same |
| -- | `size` | Override visual size independently of HTML level |

**Breaking changes:**

- H3 in cytario-web uses `text-lg` without bold. The design system H3 uses `text-xl font-semibold`. You may need to add `className="font-normal"` to match the current lighter H3 weight, or update your designs to use the bolder treatment.
- The design system also exports a generic `Heading` component with `as` (h1-h6) and `size` (xs-2xl) props for cases where the semantic level and visual size should differ.

### 5.12 Link

**Before:**

```tsx
import { Link } from "~/components/Link";

<Link to="/buckets/my-bucket">my-bucket</Link>
```

**After:**

```tsx
import { Link } from "@cytario/design";

<Link href="/buckets/my-bucket">my-bucket</Link>
```

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `to` | `href` | React Aria Link uses `href` |
| `className` | `className` | Same |
| -- | `variant` | `"default"` (teal, underlined) or `"subtle"` (gray, no underline) |

**Breaking change:** The cytario-web Link extends react-router's `Link`. The design system Link extends React Aria's `Link`. React Aria's Link uses a standard `href` attribute by default and renders an `<a>` tag. For client-side navigation in React Router v7, you need to configure a **router provider** so React Aria links integrate with your router. See the [React Aria routing guide](https://react-spectrum.adobe.com/react-aria/routing.html):

```tsx
// app/root.tsx
import { RouterProvider } from "@cytario/design";
import { useNavigate } from "react-router";

function App() {
  const navigate = useNavigate();
  return (
    <RouterProvider navigate={navigate}>
      {/* your app */}
    </RouterProvider>
  );
}
```

> **Important:** Import `RouterProvider` from `@cytario/design`, **not** from `react-aria-components`. The design system bundles its own copy of `react-aria-components`; importing `RouterProvider` from a separate copy creates two React context trees, and design system components will not see the router configuration. See the [`react-aria-components` Imports](#react-aria-components-imports) section.

This makes all React Aria Link components (including ButtonLink, IconButtonLink, Breadcrumbs links) use client-side navigation.

### 5.13 ButtonLink / IconButtonLink

**Before:**

```tsx
import { ButtonLink, IconButtonLink } from "~/components/Controls";

<ButtonLink to="/buckets" theme="primary" scale="medium">
  Browse buckets
</ButtonLink>

<IconButtonLink to={overlayUrl} icon="ExternalLink" label="Open overlay" scale="small" />
```

**After:**

```tsx
import { ButtonLink, IconButtonLink } from "@cytario/design";
import { ExternalLink } from "lucide-react";

<ButtonLink href="/buckets" variant="primary" size="md">
  Browse buckets
</ButtonLink>

<IconButtonLink href={overlayUrl} icon={ExternalLink} aria-label="Open overlay" size="sm" />
```

**Prop mapping follows the same patterns as Button and Link.** The `to` prop becomes `href`. Variant/size mapping is the same as Button.

**`download` prop:** The current `ButtonLink` supports a `download` prop that sets both the HTML `download` attribute and `reloadDocument={true}` on the React Router Link (used for S3 presigned URL downloads, e.g., Cyberduck profile export). React Aria's `Link` renders a plain `<a>` tag that supports `download` natively, but verify that the `RouterProvider` navigation interception does not swallow download clicks. If it does, download links need special handling (e.g., `target="_self"` or excluding from the router provider).

### 5.14 Breadcrumbs

**Before:**

```tsx
// Custom implementation reading from route matches
import { Breadcrumbs } from "~/components/Breadcrumbs/Breadcrumbs";
import { BreadcrumbLink } from "~/components/Breadcrumbs/BreadcrumbLink";

// Renders from useMatches() with handle.breadcrumb convention
<Breadcrumbs />
```

**After:**

The design system Breadcrumbs component accepts a data-driven `items` array. You need to build the items from your route matches:

```tsx
import { Breadcrumbs } from "@cytario/design";
import type { BreadcrumbItem } from "@cytario/design";
import { useMatches } from "react-router";
import type { UIMatch } from "react-router";

// The current handle.breadcrumb is a function, not a static string.
// It returns BreadcrumbData | BreadcrumbData[] with fields: { label, to, isRoot?, isActive? }
type BreadcrumbMatch = UIMatch<
  unknown,
  { breadcrumb: (match: BreadcrumbMatch) => BreadcrumbData | BreadcrumbData[] }
>;

function AppBreadcrumbs() {
  const matches = useMatches() as BreadcrumbMatch[];
  const crumbs = matches
    .filter((m) => m.handle?.breadcrumb)
    .flatMap((m) => {
      const result = m.handle.breadcrumb(m);
      return Array.isArray(result) ? result : [result];
    });

  // Note: isRoot crumbs render a <Logo> in the current implementation.
  // The design system Breadcrumbs does not support custom render per item.
  // Handle isRoot separately or use a custom first item.
  const items: BreadcrumbItem[] = crumbs
    .filter((c) => !c.isRoot)
    .map((c) => ({ id: c.to, label: c.label, href: c.to }));

  return <Breadcrumbs items={items} />;
}
```

> **Note:** The current `BreadcrumbLink` wraps each label in `<TooltipSpan>` for truncation detection. The design system Breadcrumbs do not have this feature. Long breadcrumb labels may need CSS `text-overflow: ellipsis` styling.

The separator is a `ChevronRight` icon (built in). The current cytario-web Breadcrumbs use `Slash` as a separator -- this is a minor visual change.

### 5.15 Menu

**Before:**

```tsx
import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";

<Menu>
  <MenuButton className="..."><User size={20} /></MenuButton>
  <MenuItems className="...">
    <MenuItem>
      {({ active }) => (
        <a href="/settings" className={active ? "bg-slate-100" : ""}>Settings</a>
      )}
    </MenuItem>
    <MenuItem>
      {({ active }) => (
        <button onClick={logout} className={active ? "bg-slate-100" : ""}>Sign out</button>
      )}
    </MenuItem>
  </MenuItems>
</Menu>
```

**After:**

```tsx
import { Menu, IconButton } from "@cytario/design";
import { User, Settings, LogOut } from "lucide-react";

<Menu
  items={[
    { id: "settings", label: "Settings", icon: Settings, onAction: () => navigate("/settings") },
    { id: "logout", label: "Sign out", icon: LogOut, onAction: logout, isDanger: true },
  ]}
>
  <IconButton icon={User} aria-label="User menu" variant="ghost" />
</Menu>
```

**Breaking changes:**

- The API is data-driven (`items` array) instead of compositional (render function children).
- Menu items are defined as `MenuItemData` objects with `id`, `label`, `icon?`, `onAction?`, `href?`, `target?`, `isDisabled?`, `isDanger?`.
- The trigger element is passed as `children`, not through a `MenuButton` wrapper.
- Navigation actions should use `onAction` with a `navigate()` call, not `<a>` tags.
- **External links:** `MenuItemData` now supports `href` and `target` props. For external links (e.g., the Keycloak Account Settings link in `UserMenu`), use `href` with `target="_blank"` instead of `onAction` with `window.location.href`:

```tsx
<Menu
  items={[
    { id: "settings", label: "Account Settings", icon: Settings, href: accountSettingsUrl, target: "_blank" },
    { id: "logout", label: "Sign out", icon: LogOut, onAction: logout, isDanger: true },
  ]}
>
  <IconButton icon={User} aria-label="User menu" variant="ghost" />
</Menu>
```

### 5.16 Field

The design system `Field` component is a thin wrapper that renders a label, child control, description, and error message. It is **not** a Headless UI Field -- it is a plain `<div>` with layout styling.

**Before:**

```tsx
import { Field, Label, Description } from "@headlessui/react";

<Field>
  <Label>Email</Label>
  <Input scale="large" {...register("email")} />
  <Description>We'll never share your email.</Description>
  {errors.email && <p className="text-rose-700 text-sm">{errors.email.message}</p>}
</Field>
```

**After:**

```tsx
import { Field, Input } from "@cytario/design";

<Field label="Email" description="We'll never share your email." error={errors.email}>
  <Input size="lg" {...register("email")} />
</Field>
```

**Key feature:** The `error` prop accepts both a string (`"Required"`) and an object with a `message` property (`errors.email` from react-hook-form). This makes integration with react-hook-form's `FieldError` type seamless.

### 5.17 ToggleButton

**Before (inline in ViewModeToggle):**

```tsx
<button
  className={`${active ? "bg-cytario-turquoise-500 text-white" : "bg-transparent text-slate-700"} w-8 h-8 ...`}
  onClick={() => setMode("list")}
  aria-label="List view"
>
  <List size={20} />
</button>
```

**After:**

```tsx
import { ToggleButton } from "@cytario/design";
import { List } from "lucide-react";

<ToggleButton
  isSelected={mode === "list"}
  onChange={() => setMode("list")}
  variant="primary"
  size="sm"
  aria-label="List view"
>
  <List size={16} />
</ToggleButton>
```

**Prop mapping:**

| cytario-web | @cytario/design | Notes |
|---|---|---|
| `active` (custom) | `isSelected` | React Aria controlled state |
| `onClick` | `onChange` | `(isSelected: boolean) => void` |
| `label` | `aria-label` | Accessibility label |
| -- | `variant` | `"default"` or `"primary"` (uses teal when selected) |
| -- | `size` | `"sm"`, `"md"`, `"lg"` |

### 5.18 Icon

**Before:**

```tsx
import { Icon } from "~/components/Controls";

<Icon icon="Download" size={20} />
```

**After:**

```tsx
import { Icon } from "@cytario/design";
import { Download } from "lucide-react";

<Icon icon={Download} size="md" />
```

**Size mapping:**

| @cytario/design `size` | Pixel value |
|---|---|
| `"sm"` | 16px |
| `"md"` | 20px |
| `"lg"` | 24px |
| `"xl"` | 32px |

**Breaking change:** The design system Icon accepts a Lucide **component** (`Download`), not a string key (`"Download"`). This is a deliberate decision for tree-shaking. The current cytario-web Icon imports the entire `lucide-react/icons` object, which prevents dead code elimination.

### 5.19 Spinner (LavaLoader replacement)

The `LavaLoader` is a distinctive animated SVG. The design system provides a simpler `Spinner` (rotating circle). Use `Spinner` as a general-purpose loading indicator. Keep `LavaLoader` where the branded animation is desired (e.g., page-level loading).

```tsx
import { Spinner } from "@cytario/design";

// Inline spinner (e.g., inside a button or next to text)
<Spinner size="sm" />

// Standalone spinner with accessible label
<Spinner size="lg" aria-label="Loading data..." />
```

### 5.20 Tabs

The design system now provides a `Tabs` component built on React Aria Tabs. This replaces Headless UI's `TabGroup`, `Tab`, `TabList`, `TabPanel`, and `TabPanels`.

**Before:**

```tsx
import { TabGroup, TabList, Tab, TabPanels, TabPanel } from "@headlessui/react";

<TabGroup selectedIndex={selectedIndex} onChange={setSelectedIndex}>
  <TabList className="flex gap-2 border-b ...">
    <Tab className="px-4 py-2 data-[selected]:text-teal-600 ...">Presets</Tab>
    <Tab className="px-4 py-2 data-[selected]:text-teal-600 ...">Channels</Tab>
  </TabList>
  <TabPanels>
    <TabPanel>Presets content</TabPanel>
    <TabPanel>Channels content</TabPanel>
  </TabPanels>
</TabGroup>
```

**After:**

```tsx
import { Tabs, TabList, Tab, TabPanel } from "@cytario/design";

<Tabs selectedKey={selectedKey} onSelectionChange={setSelectedKey}>
  <TabList>
    <Tab id="presets">Presets</Tab>
    <Tab id="channels">Channels</Tab>
  </TabList>
  <TabPanel id="presets">Presets content</TabPanel>
  <TabPanel id="channels">Channels content</TabPanel>
</Tabs>
```

**Prop mapping:**

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `TabGroup` | `Tabs` | Root wrapper |
| `TabList` | `TabList` | Same name |
| `Tab` | `Tab` | Requires `id` prop (string key) |
| `TabPanels` | -- | Removed; no wrapper needed around panels |
| `TabPanel` | `TabPanel` | Requires `id` prop matching the corresponding `Tab` |
| `selectedIndex` | `selectedKey` | Numeric index -> string key |
| `onChange` (index: number) | `onSelectionChange` (key: Key) | Use `Key` type from `@cytario/design` |

**Variants and sizes:**

The design system Tabs support two variants and three sizes:

| Prop | Values | Default |
|---|---|---|
| `variant` | `"underline"`, `"pills"` | `"underline"` |
| `size` | `"sm"`, `"md"`, `"lg"` | `"md"` |

**Breaking changes:**

- **String keys instead of numeric indices.** Each `Tab` and `TabPanel` must have an `id` prop (string). Selection is tracked by key, not index. If you were using `selectedIndex` with numeric values, convert to named string keys.
- **No `TabPanels` wrapper.** Headless UI requires a `TabPanels` component wrapping all `TabPanel` components. The design system does not -- `TabPanel` components are direct children of `Tabs`.
- **Custom styling via `data-[selected]`/`data-[hover]` selectors must be reimplemented.** React Aria Tabs use `data-selected` and render function `className` callbacks for state-dependent styling. The Image Viewer's `Presets.tsx` (which uses dynamic gradient backgrounds per tab) will need its styling logic adapted.
- **`onSelectionChange` receives a `Key` (string | number), not an index.** Type handlers accordingly:

```tsx
import type { Key } from "@cytario/design";

const [selectedKey, setSelectedKey] = useState<Key>("presets");
```

---

## 6. Components Staying in cytario-web

These components have no design system equivalent and should remain in the application codebase. Apply design tokens to them over time for visual consistency.

| Component | Reason |
|---|---|
| **RouteModal** (wrapper) | URL-driven modal behavior is app-specific. Use `Dialog` internally but keep the routing logic in cytario-web. |
| **FormWizard / FormWizardNav / FormWizardProgress** | Multi-step form orchestration is app-specific. Use design system buttons and fields inside the wizard. |
| **Table / DataGrid** | Built on TanStack Table with column resize, sort, and virtualization. React Aria Table does not support these features. Apply design tokens to the existing implementation. |
| **DirectoryView** (all sub-components) | Domain-specific file browser. Use design system primitives (Button, IconButton, Tooltip) inside it. |
| **Image Viewer** (non-UI sub-components) | Domain-specific microscopy viewer. Headless UI usage (Tab, Popover, RadioGroup, Field/Label) is migrated in Phases 2-4. Keep custom Switch for channel colors. Keep deck.gl layers, decoders, measurement tools, and state management as-is. |
| **GlobalSearch / SearchBar** | App-specific search with server-side fetching. `Suggestions.tsx` Headless UI `Transition` is migrated to `motion` in Phase 3. |
| **LavaLoader** | Branded animated loader. Keep alongside the simpler Spinner. |
| **Logo** | Animated SVG brand asset. |
| **Section / Container / Footer** | Layout primitives tied to the app's page structure. |
| **ClientOnly** | SSR utility. |
| **DescriptionList** | Simple `<dl>` wrapper -- too trivial for the design system. |
| **TooltipSpan** | Auto-tooltip on text truncation detection. No design system equivalent. |
| **DomainSlider / Histogram** | Domain-specific viewer controls (no Headless UI dependency). |

---

## 7. Token Migration

### Current State

cytario-web hardcodes colors in two places:

1. `tailwind.config.ts` -- custom `cytario.turquoise` (10-shade scale) and `cytario.purple.500`
2. Inline Tailwind classes -- `text-slate-700`, `bg-rose-300`, `border-gray-200`, etc.

There is no token system. Colors are referenced by Tailwind utility names.

### Target State

The design system provides CSS custom properties (generated from W3C DTCG token JSON):

```css
/* From @cytario/design/tokens/variables.css */
--color-teal-500: #35b7b8;
--color-purple-700: #5c2483;
--color-brand-primary: var(--color-purple-700);
--color-brand-accent: var(--color-teal-500);
--color-action-primary: var(--color-teal-500);
--color-text-primary: var(--color-slate-900);
--color-text-danger: var(--color-rose-700);
--color-border-default: var(--color-neutral-200);
/* ... etc */
```

### Migration Approach

You do **not** need to migrate all Tailwind classes to CSS custom properties at once. The recommended approach:

1. **Import the tokens CSS** (done in step 3 of Installation).
2. **Migrated components use tokens automatically** -- design system components already reference `var(--color-*)`.
3. **Gradually update app-specific styles.** When touching a file, replace hardcoded colors with token references:

```diff
- <div className="bg-slate-100 border-slate-200 text-slate-900">
+ <div className="bg-[var(--color-surface-muted)] border-[var(--color-border-default)] text-[var(--color-text-primary)]">
```

4. **Fix the gray/slate inconsistency.** The current codebase mixes `gray-*` (in DataGrid/Table) and `slate-*` (everywhere else). Standardize on the token aliases.

### Color Mapping Reference

| cytario-web Tailwind class | Token CSS variable |
|---|---|
| `text-cytario-turquoise-500` | `var(--color-teal-500)` |
| `text-cytario-turquoise-700` | `var(--color-teal-700)` |
| `bg-cytario-turquoise-500` | `var(--color-action-primary)` |
| `text-cytario-purple-500` | `var(--color-purple-500)` |
| `text-slate-900` | `var(--color-text-primary)` |
| `text-slate-500` | `var(--color-text-secondary)` |
| `text-slate-400` | `var(--color-text-tertiary)` |
| `text-rose-700` | `var(--color-text-danger)` |
| `bg-white` | `var(--color-surface-default)` |
| `bg-slate-50` / `bg-slate-100` | `var(--color-surface-muted)` |
| `border-slate-200` | `var(--color-border-default)` |
| `border-slate-300` | `var(--color-border-strong)` |

---

## 8. Form Integration with react-hook-form

cytario-web uses React Hook Form + Zod for all forms. The design system components are compatible with this setup, but some integration patterns change.

### Input + register()

React Hook Form's `register()` returns `{ onChange, onBlur, name, ref }`. The design system Input (React Aria TextField) accepts `onChange` and `name` directly:

```tsx
import { Input } from "@cytario/design";
import { useForm } from "react-hook-form";

const { register, formState: { errors } } = useForm({ ... });

<Input
  label="Bucket name"
  size="lg"
  prefix="s3://"
  errorMessage={errors.name?.message}
  {...register("name")}
/>
```

This works because React Aria's `TextField` internally renders a native `<input>`, and `register()` attaches to it via the forwarded ref.

### Select + Controller

The design system Select is a controlled component (not a native `<select>`), so `register()` does not work. Use `Controller`:

```tsx
import { Select } from "@cytario/design";
import { Controller, useForm } from "react-hook-form";

const { control, formState: { errors } } = useForm({ ... });

<Controller
  name="region"
  control={control}
  render={({ field }) => (
    <Select
      label="Region"
      items={regions}
      selectedKey={field.value}
      onSelectionChange={(key) => field.onChange(key)}
      errorMessage={errors.region?.message}
    />
  )}
/>
```

### Checkbox + Controller

```tsx
<Controller
  name="acceptTerms"
  control={control}
  render={({ field }) => (
    <Checkbox
      isSelected={field.value}
      onChange={field.onChange}
    >
      I accept the terms
    </Checkbox>
  )}
/>
```

### Switch + Controller

```tsx
<Controller
  name="enableNotifications"
  control={control}
  render={({ field }) => (
    <Switch
      isSelected={field.value}
      onChange={field.onChange}
    >
      Enable notifications
    </Switch>
  )}
/>
```

### RadioGroup + Controller

```tsx
<Controller
  name="provider"
  control={control}
  render={({ field }) => (
    <RadioGroup value={field.value} onChange={field.onChange}>
      <RadioButton value="aws">AWS</RadioButton>
      <RadioButton value="gcs">Google Cloud Storage</RadioButton>
    </RadioGroup>
  )}
/>
```

### Field + FieldError

The design system `Field` component accepts react-hook-form's `FieldError` type directly in the `error` prop:

```tsx
import { Field, Input } from "@cytario/design";

<Field label="Email" error={errors.email}>
  <Input {...register("email")} />
</Field>
```

No need to extract `.message` -- the `Field` component handles both `string` and `{ message?: string }` shapes.

---

## 9. Toast Migration

### Current Architecture

cytario-web uses a Zustand store for toast notifications:

```tsx
// Current: Zustand store
import { useNotificationStore } from "~/components/Notification/Notification.store";

const { addNotification } = useNotificationStore();
addNotification({ status: "success", message: "Bucket connected" });

// Rendered via NotificationList component (positioned top-center)
<NotificationList />
```

### New Architecture

The design system uses React Context via `ToastProvider` + `useToast`:

```tsx
// New: React Context
import { useToast } from "@cytario/design";

const { toast } = useToast();
toast({ variant: "success", message: "Bucket connected" });
```

### Step 1: Add ToastProvider to root (with toast bridge for non-React code)

The `ToastProvider` accepts an optional `bridge` prop for code outside the React tree (e.g., deck.gl callbacks in `OverlaysLayer.tsx`). Set up the bridge as a shared module:

```ts
// app/toast-bridge.ts
import { createToastBridge } from "@cytario/design";
export const toastBridge = createToastBridge();
```

```tsx
// app/root.tsx
import { ToastProvider } from "@cytario/design";
import { toastBridge } from "./toast-bridge";

export default function App() {
  return (
    <ToastProvider bridge={toastBridge}>
      {/* existing app tree */}
    </ToastProvider>
  );
}
```

The `ToastProvider` renders a fixed-position container (`bottom-4 right-4 z-50`) via a portal to `document.body`. You can remove the `<div id="notification" />` portal node from your HTML.

The bridge subscribes to external emits when the provider mounts. Any code -- including non-React code like deck.gl tile callbacks -- can call `toastBridge.emit()` to show a toast:

```ts
// In deck.gl callback (outside React)
import { toastBridge } from "~/toast-bridge";
toastBridge.emit({ variant: "error", message: "Layer failed to load" });
```

This replaces the current pattern where `OverlaysLayer.tsx` receives `addNotification` as a function parameter. The bridge pattern is cleaner because it removes the need to thread the notification function through non-React code.

> **UX change:** The current notifications render at **top-center** (`top-8 left-0 right-0 mx-auto`). The design system toasts render at **bottom-right**. This is a visible position change that should be approved by the product team before migrating.

### Step 2: Replace store calls

| Zustand (current) | @cytario/design (new) |
|---|---|
| `addNotification({ status: "success", message })` | `toast({ variant: "success", message })` |
| `addNotification({ status: "error", message })` | `toast({ variant: "error", message })` |
| `addNotification({ status: "info", message })` | `toast({ variant: "info", message })` |

### Step 3: Handle server flash notifications and `useBackendNotification`

The current app uses two mechanisms for server-originated notifications:
1. Flash data from the session (set in loaders/actions, read in root)
2. `useBackendNotification()` hook (`app/components/Notification/Notification.store.ts`) which reads from both `useActionData()` and `useLoaderData()`

Replace both with a single component:

```tsx
// In your root layout component
import { useToast } from "@cytario/design";
import { useActionData, useLoaderData } from "react-router";

function FlashNotifications() {
  const { toast } = useToast();
  const actionData = useActionData<{ notification?: { status: string; message: string } }>();
  const loaderData = useLoaderData<{ notification?: { status: string; message: string } }>();
  const notification = actionData?.notification || loaderData?.notification;

  useEffect(() => {
    if (notification) {
      toast({ variant: notification.status as ToastVariant, message: notification.message });
    }
  }, [notification, toast]);

  return null;
}
```

> **Edge case:** `OverlaysLayer.tsx` calls `addNotification` from deck.gl tile callbacks (outside the React tree). `useToast()` requires React context. Use `createToastBridge()` from `@cytario/design` -- see Step 1 above for the setup pattern. The bridge lets non-React code call `toastBridge.emit(...)` while the `ToastProvider` handles rendering.

### Step 4: Remove old notification system

Once all callsites are migrated:

1. Delete `app/components/Notification/Notification.store.ts` (Zustand store + `useBackendNotification` hook)
2. Delete `app/components/Notification/Notification.tsx` (notification UI component)
3. Remove the `<div id="notification" />` from root HTML
4. Remove `useBackendNotification` callsite in `app/routes/objects.route.tsx`

### Auto-dismiss timing

The design system uses the same timing as the current implementation:

| Variant | Duration |
|---|---|
| `success` | 5 seconds |
| `info` | 5 seconds |
| `error` | 10 seconds |

Override per-toast with the `duration` property: `toast({ variant: "error", message: "...", duration: 15000 })`.

---

## 10. Testing Migration

### Principles

1. **Test by user perspective.** Query elements by `role`, `name`, `label`, or `text` -- not by CSS class or data attributes.
2. **Do not test headless library internals.** Whether a dropdown uses React Aria or Headless UI is an implementation detail. Test that the user can select an option, not that a specific ARIA attribute is set.
3. **Use `screen` queries from Testing Library.** The design system components use standard ARIA roles, so your queries should not need to change significantly.

### Common Changes

**Button click:**

```diff
- await user.click(screen.getByRole("button", { name: "Save" }));
+ await user.click(screen.getByRole("button", { name: "Save" }));
  // No change -- querying by role works the same.
```

**Checkbox state:**

```diff
- expect(screen.getByRole("checkbox")).toHaveAttribute("data-checked");
+ expect(screen.getByRole("checkbox")).toBeChecked();
  // Use standard checked assertion, not Headless UI data attributes.
```

**Select interaction:**

```diff
  // Before: native select
- await user.selectOptions(screen.getByRole("combobox"), "us-east-1");
  // After: custom dropdown
+ await user.click(screen.getByRole("button", { name: /region/i }));
+ await user.click(screen.getByRole("option", { name: "US East (N. Virginia)" }));
```

**Dialog:**

```diff
  // Both before and after -- query by dialog role:
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toHaveAccessibleName("Connect bucket");
```

**Switch:**

```diff
- expect(screen.getByRole("switch")).toHaveAttribute("data-checked");
+ expect(screen.getByRole("switch")).toBeChecked();
```

### Tip: Remove Headless UI test utilities

If you have any test helpers that rely on Headless UI's `data-*` attributes (e.g., `data-checked`, `data-selected`, `data-active`), replace them with standard ARIA queries. React Aria uses standard HTML attributes (`aria-checked`, `aria-selected`, `aria-expanded`) that are directly testable with Testing Library matchers.

### Install `@testing-library/user-event`

**CRITICAL**: The project does **not** have `@testing-library/user-event` installed (confirmed in `package.json`) — all existing tests use `fireEvent`. React Aria's press handling is pointer-event based; `fireEvent.click` synthesizes a `MouseEvent` and may not trigger `onPress` handlers reliably. Install it before migrating any component tests:

```bash
npm install -D @testing-library/user-event
```

All migrated component tests should use `userEvent` for interactions:

```tsx
import userEvent from "@testing-library/user-event";

const user = userEvent.setup();
await user.click(screen.getByRole("button", { name: "Save" }));
```

### RouterProvider in Tests

Tests for components using React Aria navigation (Link, ButtonLink, Breadcrumbs, Menu, Tabs with links) need a `RouterProvider` in the test render wrapper. Without it, React Aria Links will do full-page navigation instead of calling `navigate()`.

> **Important:** Always import `RouterProvider` from `@cytario/design` -- never from `react-aria-components` directly. The design system re-exports it and this ensures the same context tree as production.

The existing project convention uses `createRoutesStub` from `react-router` (established in `RouteModal.test.tsx`). For tests that only need a routing context without full route definitions, use `MemoryRouter` with the `RouterProvider` wrapper:

```tsx
import { RouterProvider } from "@cytario/design";
import { render } from "@testing-library/react";
import { MemoryRouter, useNavigate } from "react-router";

function RouterWrapper({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return <RouterProvider navigate={navigate}>{children}</RouterProvider>;
}

// Usage in tests:
render(
  <MemoryRouter>
    <RouterWrapper>
      <MyComponent />
    </RouterWrapper>
  </MemoryRouter>
);
```

For tests requiring loader data or route matching, continue using `createRoutesStub` as in `RouteModal.test.tsx`.

Note: No shared `test-utils.tsx` or `renderWithProviders` helper exists in the project currently. Each test is self-contained. Consider creating a shared wrapper during Phase 0.

### React Aria Testing Requirements

React Aria components use `requestAnimationFrame` for overlay positioning and focus management. Tests using `happy-dom` may need:

- `vi.useFakeTimers()` with `shouldAdvanceTime: true` for overlay tests (Dialog, Tooltip, Menu)
- `await user.click()` (not `fireEvent.click()`) for proper press event simulation — React Aria uses pointer events, not click events
- `act()` wrapping for state updates triggered by React Aria's internal effects
- Note: `vitest.setup.ts` already calls `mockAnimationsApi()` from `jsdom-testing-mocks`. Verify empirically whether this is sufficient for React Aria's overlay positioning.

### Tabs Interaction Tests

The design system Tabs use **string keys** (`selectedKey` / `onSelectionChange`) instead of Headless UI's **numeric indices** (`selectedIndex` / `onChange`). Tests must query tabs by role and name, never by index.

**Before (Headless UI):**

```tsx
import { TabGroup } from "@headlessui/react";
import { render, screen, fireEvent } from "@testing-library/react";

const renderWithTabGroup = () => {
  return render(
    <TabGroup>
      <ChannelsController />
    </TabGroup>
  );
};

test("renders tabs", () => {
  renderWithTabGroup();
  const tabs = screen.getAllByRole("tab");
  expect(tabs[0]).toHaveTextContent("Presets");
  // Headless UI: selected tab is tracked by numeric index
  fireEvent.click(tabs[1]);
});
```

**After (@cytario/design):**

```tsx
import { Tabs, TabList, Tab, TabPanel } from "@cytario/design";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const renderWithTabs = () => {
  return render(
    <Tabs selectedKey="presets" onSelectionChange={vi.fn()}>
      <TabList>
        <Tab id="presets">Presets</Tab>
        <Tab id="channels">Channels</Tab>
      </TabList>
      <ChannelsController />
    </Tabs>
  );
};

test("selects a tab by name", async () => {
  const user = userEvent.setup();
  renderWithTabs();
  // Query by role + accessible name, not by index
  await user.click(screen.getByRole("tab", { name: "Channels" }));
  expect(screen.getByRole("tab", { name: "Channels" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
});
```

Key differences:
- Replace `TabGroup` wrapper with `Tabs` (providing `selectedKey` as a string, not a number).
- Query tabs with `screen.getByRole("tab", { name: "..." })` -- never by array index.
- Assert selection via `aria-selected="true"`, not Headless UI's `data-selected` attribute.
- The `ChannelsController.test.tsx` wrapper (`renderWithTabGroup`) must be updated to `renderWithTabs` during Phase 4.

### Toast Bridge Testing

`createToastBridge()` returns a module-level singleton. In tests, you have two options depending on what you are testing:

**Option A: Mock `useToast()` (preferred for component tests).** When testing a component that calls `toast()`, mock the hook. This avoids needing a `ToastProvider` in the test tree:

```tsx
import { useToast } from "@cytario/design";

vi.mock("@cytario/design", async () => {
  const actual = await vi.importActual("@cytario/design");
  return {
    ...actual,
    useToast: vi.fn(() => ({ toast: vi.fn() })),
  };
});

test("shows success toast on save", async () => {
  const mockToast = vi.fn();
  vi.mocked(useToast).mockReturnValue({ toast: mockToast });

  // ... render component, trigger save ...

  expect(mockToast).toHaveBeenCalledWith(
    expect.objectContaining({ variant: "success" })
  );
});
```

**Option B: Mock the bridge module (for non-React code).** When testing code that calls `toastBridge.emit()` directly (e.g., deck.gl callbacks in `OverlaysLayer.tsx`), mock the bridge module:

```tsx
vi.mock("~/toast-bridge", () => ({
  toastBridge: { emit: vi.fn() },
}));

import { toastBridge } from "~/toast-bridge";

test("emits error toast on tile load failure", () => {
  // ... trigger the failure path ...

  expect(toastBridge.emit).toHaveBeenCalledWith(
    expect.objectContaining({ variant: "error" })
  );
});
```

**Reset between tests:** Because the bridge is a singleton, always call `vi.clearAllMocks()` in `beforeEach` to reset `emit` call counts. Do not attempt to create fresh bridge instances per test -- the module-level singleton pattern means imports always reference the same object.

### Snapshot Strategy

**Delete snapshots for migrated components; do not regenerate them.** Replace with explicit behavioral assertions. Current snapshots encode Headless UI DOM artifacts that have no value after migration:

| Snapshot file | Issues | Recommendation |
|---|---|---|
| `Checkbox.test.tsx.snap` (4 snapshots) | `data-headlessui-state`, `data-checked`, generated `id="headlessui-checkbox-*"` | Delete; replace with `toBeChecked()` assertions |
| `Button.test.tsx.snap` (3 snapshots) | Hardcoded Tailwind class strings | Delete; replace with behavioral assertions |

### Escape Key Testing

The `RouteModal.test.tsx` test uses `fireEvent.keyDown(window, { key: "Escape" })` to test dismiss behavior. This targets Headless UI's specific behavior of listening on `window`. React Aria Dialog captures Escape on the overlay element itself. After migration, use:

```tsx
await user.keyboard("{Escape}");
```

This dispatches through the focused element, which is the correct approach for React Aria.

### Test Style Compliance

When migrating component tests, fix `it()` calls to `test()` (enforced by ESLint). Known violations are more widespread than just BreadcrumbLink:

- `app/components/__tests__/Button.test.tsx` (5 uses)
- `app/components/__tests__/Checkbox.test.tsx` (6 uses)
- `app/components/__tests__/IconButton.test.tsx` (4 uses)
- `app/components/Breadcrumbs/__tests__/BreadcrumbLink.test.tsx` (4 uses)

Run `npm run lint -- --fix` as the first step of test migration to auto-fix these.

### Test Files Requiring Changes Per Phase

| Phase | Test files affected |
|---|---|
| Phase 1 (Button, IconButton, Checkbox, Switch) | `Button.test.tsx`, `IconButton.test.tsx`, `Checkbox.test.tsx` + their snapshots |
| Phase 2 (Select, Field, Image Viewer RadioGroup) | `Select.test.tsx`, `ChannelsControllerItem.test.tsx` (RadioGroup wrapper), `MinMaxSettings.test.tsx` |
| Phase 3 (Dialog, Toast, ColorPicker Popover) | `RouteModal.test.tsx` (Escape key, wrapper changes), any test calling `addNotification` (mock `useToast` or `toastBridge` instead) |
| Phase 4 (Link, Breadcrumbs, Tabs, Image Viewer Tabs) | `BreadcrumbLink.test.tsx` (needs RouterProvider wrapper), `ChannelsController.test.tsx` (TabGroup -> Tabs wrapper), any app-level Tab tests |

---

## 11. Migration Checklist

Use this checklist to track progress per component. Copy into a GitHub issue or project board.

### Phase 0: Prerequisites

- [ ] **Verify `className` overrides work on design system components** (empirical test)
  - [ ] Confirm that app-level Tailwind v3 classes override `@layer cytario-design` styles as expected

- [ ] **Set up RouterProvider**
  - [ ] Add `RouterProvider` from `@cytario/design` to `app/root.tsx`
  - [ ] Pass `navigate` from `useNavigate()` and `useHref` from `react-router`
  - [ ] Verify placement works within the Layout export (router context availability)

- [ ] **Add ToastProvider with bridge to root**
  - [ ] Create `app/toast-bridge.ts` with `createToastBridge()`
  - [ ] Add `ToastProvider` with `bridge` prop to `app/root.tsx`

### Phase 1: Foundation

- [ ] **Icon** (migrate first — prerequisite for IconButton, EmptyState, etc.)
  - [ ] Replace string-based `Icon` with component-based imports
  - [ ] Remove dynamic icon lookup (enables tree-shaking)
  - [ ] Update all callsites
  - [ ] Update tests

- [ ] **Button**
  - [ ] Replace `Button` imports with `@cytario/design`
  - [ ] Rename `theme` -> `variant`, `scale` -> `size`, `onClick` -> `onPress`
  - [ ] Map variant values (`error` -> `destructive`, `transparent` -> `ghost`, `white` -> `secondary`)
  - [ ] Update tests
  - [ ] Visual regression check

- [ ] **IconButton**
  - [ ] Replace `IconButton` imports
  - [ ] Change `icon` from string to Lucide component import
  - [ ] Rename `label` -> `aria-label`
  - [ ] Update tests

- [ ] **Input**
  - [ ] Replace `Input` imports
  - [ ] Rename `scale` -> `size`
  - [ ] Remove `theme` prop; handle dark mode via CSS tokens
  - [ ] Verify `register()` compatibility
  - [ ] Update tests

- [ ] **Checkbox**
  - [ ] Replace Headless UI `Checkbox` with `@cytario/design`
  - [ ] Rename `checked` -> `isSelected`
  - [ ] Remove manual check icon rendering
  - [ ] Wrap in `Controller` if used with react-hook-form
  - [ ] Update tests

- [ ] **Switch**
  - [ ] Replace Headless UI `Switch` with `@cytario/design`
  - [ ] Rename `checked` -> `isSelected`
  - [ ] Keep custom Switch for image viewer channel controls (arbitrary color)
  - [ ] Update tests

- [ ] **Radio / RadioButton**
  - [ ] Replace Headless UI `RadioGroup` + `Radio` with `@cytario/design`
  - [ ] Remove render function children
  - [ ] Wrap in `Controller` for react-hook-form
  - [ ] Update tests

### Phase 2: Form Infrastructure

- [ ] **Field**
  - [ ] Replace Headless UI `Field` + `Label` + `Description` with `@cytario/design` `Field`
  - [ ] Pass react-hook-form `FieldError` directly to `error` prop
  - [ ] Update tests

- [ ] **Fieldset**
  - [ ] Replace Headless UI `Fieldset` with `@cytario/design`
  - [ ] Update tests

- [ ] **Label**
  - [ ] Replace Headless UI `Label` with `@cytario/design` (if used standalone)

- [ ] **InputGroup**
  - [ ] Replace custom `InputGroup` with `@cytario/design`
  - [ ] Verify visual joining behavior
  - [ ] Update tests

- [ ] **Select**
  - [ ] Replace Headless UI native Select with `@cytario/design` custom dropdown
  - [ ] Convert `<option>` children to `items` array
  - [ ] Wrap in `Controller` for react-hook-form
  - [ ] Test keyboard navigation
  - [ ] Update tests

- [ ] **Image Viewer: Field/Label direct imports**
  - [ ] `MinMaxSettings.tsx` — replace `Field`/`Label` from `@headlessui/react` with `@cytario/design`
  - [ ] Update `MinMaxSettings.test.tsx`

- [ ] **Image Viewer: RadioGroup/Radio**
  - [ ] `ChannelsControllerItemList.tsx` — replace `RadioGroup` from `@headlessui/react` with `@cytario/design`
  - [ ] `ChannelsControllerItem.tsx` — replace `Radio` from `@headlessui/react` with `@cytario/design`
  - [ ] `OverlaysController.Item.tsx` — remove `RadioGroup` (misuse with no value/onChange; replace with plain `<div>`)
  - [ ] Update `ChannelsControllerItem.test.tsx` (RadioGroup test wrapper)

### Phase 3: Feedback and Overlay

- [ ] **Dialog**
  - [ ] Create thin `RouteModal` wrapper around `@cytario/design` `Dialog`
  - [ ] Remove Headless UI Dialog imports
  - [ ] Remove manual backdrop, panel, close button rendering
  - [ ] Update all modal consumers
  - [ ] Update tests

- [ ] **Toast**
  - [ ] Create `app/toast-bridge.ts` with `createToastBridge()` for non-React code
  - [ ] Add `ToastProvider` with `bridge` prop to root
  - [ ] Replace all `useNotificationStore().addNotification()` calls with `useToast().toast()`
  - [ ] Replace `addNotification` in `OverlaysLayer.tsx` with `toastBridge.emit()`
  - [ ] Migrate server flash notification handling (`useBackendNotification` hook)
  - [ ] Delete Zustand notification store
  - [ ] Delete old Notification components
  - [ ] Remove `<div id="notification" />` portal node
  - [ ] Update tests

- [ ] **EmptyState**
  - [ ] Replace `Placeholder` with `EmptyState`
  - [ ] Change `icon` from string to Lucide component
  - [ ] Change `children` (CTA) to `action` prop
  - [ ] Update tests

- [ ] **Spinner**
  - [ ] Add `Spinner` for inline loading states (button loading, etc.)
  - [ ] Keep `LavaLoader` for branded page-level loading

- [ ] **Image Viewer: ColorPicker Popover**
  - [ ] `ColorPicker.tsx` — replace `Popover`/`PopoverButton`/`PopoverPanel` from `@headlessui/react`
  - [ ] Use React Aria Popover (via `@cytario/design` if available, or `react-aria-components` directly)
  - [ ] Verify color picker positioning and dismiss behavior

- [ ] **GlobalSearch: Transition**
  - [ ] `Suggestions.tsx` — replace `Transition` from `@headlessui/react` with `motion` (already a project dependency)

### Phase 4: Navigation

- [ ] **React Aria RouterProvider**
  - [ ] Configure `RouterProvider` in root for client-side navigation
  - [ ] This is a prerequisite for Link, ButtonLink, Breadcrumbs

- [ ] **Link**
  - [ ] Replace react-router `Link` wrapper with `@cytario/design` `Link`
  - [ ] Change `to` -> `href`
  - [ ] Update tests

- [ ] **ButtonLink / IconButtonLink**
  - [ ] Replace custom implementations with `@cytario/design`
  - [ ] Rename props following Button/Link conventions
  - [ ] Update tests

- [ ] **Breadcrumbs**
  - [ ] Build route-match-to-items adapter
  - [ ] Replace custom Breadcrumbs with `@cytario/design`
  - [ ] Note: separator changes from `Slash` to `ChevronRight`
  - [ ] Update tests

- [ ] **Menu (UserMenu)**
  - [ ] Replace Headless UI `Menu` with `@cytario/design` `Menu`
  - [ ] Convert render function items to `MenuItemData` array
  - [ ] Update tests

- [ ] **Heading (H1/H2/H3)**
  - [ ] Replace `Fonts.tsx` exports with `@cytario/design`
  - [ ] Verify H3 weight difference (semibold vs normal)
  - [ ] Update tests

- [ ] **ToggleButton**
  - [ ] Replace inline toggle in `ViewModeToggle` with `@cytario/design` `ToggleButton`
  - [ ] Update tests

- [ ] **Tabs** (now available in `@cytario/design`)
  - [ ] Migrate any app-level tab usage from Headless UI `TabGroup` to `@cytario/design` `Tabs`
  - [ ] Convert `selectedIndex` (numeric) to `selectedKey` (string)
  - [ ] Remove `TabPanels` wrapper; add `id` prop to each `Tab` and `TabPanel`
  - [ ] Update tests

- [ ] **Image Viewer: Tab system** (most complex migration item)
  - [ ] `Presets.tsx` — replace `Tab`/`TabGroup`/`TabList` from `@headlessui/react` with `@cytario/design` `Tabs`/`Tab`/`TabList`
  - [ ] Reimplement custom styling: dynamic gradient backgrounds, `data-[selected]`/`data-[hover]` selectors -> React Aria render function `className` callbacks
  - [ ] `ChannelsController.tsx` — replace `TabPanel`/`TabPanels` from `@headlessui/react` with `@cytario/design` `TabPanel` (no `TabPanels` wrapper needed)
  - [ ] Update `ChannelsController.test.tsx` (TabGroup test wrapper)

### Phase 5: Cleanup — Full Headless UI Removal

- [ ] **Verify zero Headless UI imports**
  - [ ] Run `grep -r 'from "@headlessui/react"' app/` — must return zero results
  - [ ] `npm uninstall @headlessui/react`

- [ ] **Remove old components**
  - [ ] Delete `app/components/Controls/Button/` (Button, IconButton, ButtonLink, IconButtonLink, styles.ts, Icon.tsx)
  - [ ] Delete `app/components/Controls/Input.tsx`
  - [ ] Delete `app/components/Controls/Select.tsx`
  - [ ] Delete `app/components/Controls/Checkbox.tsx`
  - [ ] Delete `app/components/Controls/Switch.tsx`
  - [ ] Delete `app/components/Controls/Radio.tsx`
  - [ ] Delete `app/components/Controls/Label.tsx`
  - [ ] Delete `app/components/Controls/Field.tsx`
  - [ ] Delete `app/components/Controls/Fieldset.tsx`
  - [ ] Delete `app/components/Controls/InputGroup.tsx`
  - [ ] Delete `app/components/Tooltip/Tooltip.tsx`
  - [ ] Delete `app/components/Notification/` (entire directory including `Notification.store.ts`)
  - [ ] Delete `app/components/Placeholder.tsx`
  - [ ] Delete `app/components/Link.tsx`
  - [ ] Delete `app/components/Breadcrumbs/`
  - [ ] Delete `app/components/Fonts.tsx`
  - [ ] Update `app/components/Controls/index.ts` barrel exports

- [ ] **Remove portal nodes**
  - [ ] Remove `<div id="notification" />` from root HTML
  - [ ] Remove `<div id="tooltip" />` from root HTML (if all tooltips are migrated and `TooltipSpan` is updated)
  - [ ] Audit `<div id="modal" />` -- likely dead code, remove if unused

- [ ] **Token adoption**
  - [ ] Audit remaining hardcoded Tailwind color classes
  - [ ] Replace `gray-*` classes with `slate-*` or token variables
  - [ ] Replace `cytario-turquoise-*` classes with `teal-*` token variables

- [ ] **Bundle size check**
  - [ ] Verify Headless UI is fully removed from the production bundle
  - [ ] Confirm tree-shaking of Lucide icons (no full icon set import)

---

## Architectural Review Notes

**Reviewer:** Principal Web Architect
**Date:** 2026-02-21
**Reviewed against:** cytario-web `main` at `e048aea`

### 1. RouterProvider Placement: Layout vs App

The `Layout` component in `app/root.tsx` (line 108) renders `<html>`, `<body>`, header, and portal nodes. The `App` component (line 147) is just `<Outlet />`. Components rendered in Layout -- specifically `<Breadcrumbs />` inside `<AppHeader />` (line 93) and `<UserMenu />` (line 101) -- need access to the `RouterProvider` for client-side navigation via React Aria Links.

The `RouterProvider` should be placed inside `Layout`. In React Router v7, `Layout` is rendered as a child of the framework's internal `RouterProvider`, so `useNavigate()` should be available. **Verify empirically during Phase 0.**

If `useNavigate()` is not available in `Layout`, restructure by either:
1. Creating a layout route (`app/routes/layouts/app.tsx`) that renders the header, outlet, and `RouterProvider`.
2. Moving `AppHeader` inside the `App` component.

### 2. SSR Hydration of React Aria Overlays

React Aria's overlay components (Dialog, Tooltip, Popover, Menu) render into portals that are suppressed during SSR. The current Headless UI Dialog renders inline during SSR, so route-driven modals (`RouteModal`, always open) will **flash on hydration** after migration.

**Mitigation:** For the `RouteModal` wrapper, render dialog content inline (SSR-safe) with a client-side portal upgrade, or accept the flash and add a CSS transition to mask it.

### 3. Migration Ordering Risks

#### 3a. Icon migration must come first in Phase 1

The Icon component (`app/components/Controls/Button/Icon.tsx`) imports the entire `lucide-react` icons object. Converting from string-based to component-based icon imports is a prerequisite for IconButton, IconButtonLink, Placeholder, and many other components. It also unlocks tree-shaking immediately. Icon is listed first in Phase 1 -- enforce this ordering strictly.

#### 3b. RouterProvider is a hidden prerequisite for Phase 3 Dialog

The RouteModal migration (Phase 3) uses `@cytario/design` Dialog. Components used inside dialogs (e.g., `ButtonLink`, `IconButtonLink`) need the routing context from `RouterProvider`.

**Recommendation:** Move the `RouterProvider` setup to Phase 0. It has no dependencies on other migrations and is purely additive.

#### 3c. `ButtonLink` download behavior needs verification

The current `ButtonLink` supports a `download` prop that sets both the HTML `download` attribute and `reloadDocument={true}` on the React Router `Link` (used for Cyberduck profile exports). React Aria's `Link` renders a plain `<a>` tag supporting `download` natively, but verify that the `RouterProvider` navigation interception does not swallow download clicks. If it does, download links need special handling (e.g., `target="_self"`).

### 4. Coexistence Risks

#### 4a. Dual tooltip portal targets

The current Tooltip portals to `document.getElementById("tooltip")`. The design system Tooltip portals to `document.body`. During coexistence:
- z-index conflicts are possible (both use `z-50`).
- The `<div id="tooltip" />` in `app/root.tsx` can be removed only after all tooltips are migrated, including `TooltipSpan` which stays in cytario-web.

#### 4b. Notification positioning conflict

The current `NotificationList` renders at top-center. The design system `ToastProvider` renders at bottom-right. This is a **visible UX change requiring product approval**. Migrate all callsites in a single PR or use a flag to disable the old system during transition.

### 5. Accessibility Regression Testing

Consider adding these verification steps to each phase:
- `axe-core` checks in integration tests before and after migration.
- Manual screen reader testing for Dialog, Menu, and Select.
- Keyboard navigation testing for all interactive components.

### 6. `<div id="modal" />` Portal Is Likely Dead Code

`app/root.tsx` renders `<div id="modal" />` but `RouteModal` uses Headless UI's built-in portal. Verify whether any component uses this portal div and remove in Phase 5 if unused.

### Open Issues Summary

| Issue | Severity | Phase Affected |
|---|---|---|
| RouterProvider placement in Layout vs App (1) | **Medium** | Phase 0 |
| SSR hydration flash for RouteModal (2) | **Medium** | Phase 3 |
| `ButtonLink` download behavior with RouterProvider (3c) | **Low** | Phase 4 |
| Notification position change requires product approval (4b) | **Low** | Phase 3 |

---

## Frontend Engineering Review Notes

**Reviewer:** Principal Frontend Engineer
**Date:** 2026-02-21
**Scope:** Verified against codebase at `main` (`e048aea`). All corrections have been applied to the main body. The items below are **implementation context** to be aware of during migration.

### Implementation Notes

#### F6. Switch `onChange` Signature Difference

The current `app/components/Controls/Switch.tsx` wrapper types `onChange` as `() => void`, even though Headless UI passes the boolean value underneath. All callers use toggle patterns (flip a boolean in parent state). The design system Switch uses `onChange: (isSelected: boolean) => void`. The Switch prop mapping table (section 5.5) has been updated to note this. Callers may need minor signature updates during migration.

#### F16. Button `onClick` Is `PointerEventHandler`, Not `MouseEventHandler`

`app/components/Controls/Button/Button.tsx` types `onClick` as `PointerEventHandler<HTMLButtonElement>`, not `MouseEventHandler`. React Aria's `onPress` receives a `PressEvent` (a custom type). Any callsite that accesses event properties (coordinates, target, etc.) will need updates beyond a simple `onClick` -> `onPress` rename.

#### F17. IconButton Tooltip Uses `label` for Double Duty

The `label` prop on `app/components/Controls/Button/IconButton.tsx` serves as both `aria-label` on the button and `content` on the wrapping `Tooltip`. The design system's `showTooltip` and `tooltipPlacement` props are new additions, not replacements.

#### F18. RadioButton Uses `className` Callback Pattern

`app/components/Controls/Radio.tsx` uses Headless UI's `className` callback `({ checked }) => ...`, not a render function for children. The `Radio` component has a static `className` with unconditional children. This distinction matters for understanding what styling logic gets absorbed by the design system.

### Presets.tsx Tab Migration Notes

The `Presets.tsx` component (`app/components/.client/ImageViewer/components/FeatureBar/Presets.tsx`) is the most complex Tab migration item in Phase 4. Key implementation details:

1. **Numeric index-based selection.** Uses `selectedIndex={activeChannelsStateIndex}` with `onChange={setActiveChannelsStateIndex}`. The Zustand store tracks this as a number. Convert to string keys (`"0"`, `"1"`, `"2"`, `"3"`) or update the store to use string keys.
2. **Dynamic inline `style` for gradient backgrounds.** Each tab's `background` is computed from visible channel colors via `linear-gradient(-45deg, ...)`. This inline `style` prop should work with the design system `Tab`, but verify it is not overridden by built-in styles.
3. **`data-[selected]` and `data-[hover]` Tailwind selectors.** Used for border and background color changes on tab state. React Aria Tabs use `data-selected` (no brackets in the actual attribute). Tailwind v3's `data-[selected]` selector works with both forms. Verify empirically.
4. **`group/tab` named group.** `PresetLabel` uses `group-data-[selected]/tab:bg-slate-300` to style children based on parent tab state. Verify the design system `Tab` renders a containing element that receives the `data-selected` attribute.
5. **Split-tree rendering.** `TabPanels`/`TabPanel` are in `ChannelsController.tsx`, a sibling component rendered inside the same `TabGroup` ancestor. After migration, `TabPanel` components become direct children of `Tabs` -- verify the design system supports this pattern where `TabList` and `TabPanel` components are in separate component subtrees.

---

## Security Review Notes

**Reviewer:** Security Engineer
**Last updated:** 2026-02-21

### Summary

| Area | Risk | Required Action |
|---|---|---|
| Session type coupling | Low | `app/.server/auth/sessionStorage.ts:9` imports `NotificationInput` from `~/components/Notification/Notification.store`. Replace this type (inline or move to a shared types file) before deleting the notification store in Phase 5. |
| XSS (Tooltip) | Low | Verify `@cytario/design` Tooltip renders `content` as a React node, not via `innerHTML`. Code-review before Phase 3 merge. |
| S3 download interception | Medium | `RouterProvider` navigation may intercept the Cyberduck profile download link (`/api/cyberduck-profile/...`). Add an integration test confirming the browser receives the XML response with `Content-Disposition` headers. Use native `<a download>` as fallback if interception is confirmed. |
| CSP | Informational | React Aria overlays use inline `style` attributes for positioning. Document for future CSP implementation. No CSP is currently set at the application layer. |
| Toast bridge | Informational | `createToastBridge()` is a module-level singleton event emitter -- any code with access to the module can call `toastBridge.emit()`. Acceptable because the emitter carries only display strings (variant + message); no secrets, tokens, or user data flow through it. No authorization gate is needed. |

### Actions for Phase 0

1. Verify `.npmrc` contains only a read-only GitHub token (`read:packages` scope) and uses env var substitution (not a hardcoded PAT).
2. Run `npm audit` against `@cytario/design` (covers bundled `react-aria-components` transitives) and document results.
3. Record `@cytario/design` as a new SOUP entry with version, publisher, changelog URL, and accessibility conformance evidence.
4. During the transitional dual-SOUP period, keep both `@headlessui/react` and `react-aria-components` in the SOUP register. Update as each phase removes Headless UI usage.
