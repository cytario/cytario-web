# @cytario/design — Previously Missing Components

**Date:** 2026-02-22
**Context:** After migrating cytario-web to `@cytario/design`, two Headless UI components remained because the design system lacked equivalent functionality. Both have now been added. Migrating to them allows full removal of `@headlessui/react`.

---

## 1. Switch with arbitrary `color` prop

**Status: Resolved**

The `@cytario/design` Switch now accepts any valid CSS color string in the `color` prop, in addition to the existing presets (`"primary"`, `"success"`, `"destructive"`).

### Migration

Replace the Headless UI Switch in `app/components/Controls/Switch.tsx` with:

```tsx
import { Switch } from "@cytario/design";

// Before (Headless UI)
<HeadlessSwitch
  checked={checked}
  onChange={onChange}
  className="w-9 h-5 rounded-full border-2 border-slate-800 bg-slate-700"
  style={{ backgroundColor: checked ? color : colors.slate[700] }}
  disabled={disabled}
>
  <span className={`h-3 w-3 rounded-full transition border border-slate-500
    ${checked ? "translate-x-2 bg-white" : "-translate-x-2 bg-slate-500"}`}
  />
</HeadlessSwitch>

// After (@cytario/design)
<Switch
  isSelected={checked}
  onChange={onChange}
  color={color}
  isDisabled={disabled}
/>
```

### Prop mapping

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `checked` | `isSelected` | React Aria naming convention |
| `onChange` | `onChange` | Same signature `(value: boolean) => void` |
| `disabled` | `isDisabled` | React Aria naming convention |
| `style={{ backgroundColor: color }}` | `color={color}` | Pass the color string directly — the component handles selected/unselected styling internally |

### Behavior notes

- Preset colors (`"primary"`, `"success"`, `"destructive"`) use design token classes
- Any other string (e.g. `"#FF0000"`, `"rgb(0, 255, 128)"`) is applied as an inline `backgroundColor` on the track when selected
- When unselected, the track uses the design system's default neutral color regardless of the `color` prop
- The `children` prop adds a text label next to the switch (optional)

---

## 2. Popover

**Status: Resolved**

A new `Popover` component is available with three exports: `Popover`, `PopoverTrigger`, and `PopoverContent`.

### Migration

Replace the Headless UI Popover in `app/components/.client/ImageViewer/components/ChannelsController/ColorPicker.tsx` with:

```tsx
import { Popover, PopoverTrigger, PopoverContent } from "@cytario/design";

// Before (Headless UI)
<Popover className="relative">
  <PopoverButton
    className="w-5 h-5 rounded-full border-2 border-slate-500"
    style={{ backgroundColor: rgb(color) }}
  />
  <PopoverPanel anchor="bottom start" className="z-50 bg-slate-800 border border-slate-600 rounded-sm p-2">
    {({ close }) => (
      <div className="flex gap-2">
        {OVERLAY_COLORS.map((presetColor, idx) => (
          <button
            key={idx}
            onClick={() => { onColorChange(presetColor); close(); }}
            className="w-5 h-5 rounded-full border-2 border-slate-500"
            style={{ backgroundColor: rgb(presetColor) }}
          />
        ))}
      </div>
    )}
  </PopoverPanel>
</Popover>

// After (@cytario/design)
<Popover>
  <PopoverTrigger>
    <span
      className="w-5 h-5 rounded-full border-2 border-slate-500 block"
      style={{ backgroundColor: rgb(color) }}
    />
  </PopoverTrigger>
  <PopoverContent placement="bottom start" className="p-2">
    {({ close }) => (
      <div className="flex gap-2">
        {OVERLAY_COLORS.map((presetColor, idx) => (
          <button
            key={idx}
            onClick={() => { onColorChange(presetColor); close(); }}
            className="w-5 h-5 rounded-full border-2 border-slate-500"
            style={{ backgroundColor: rgb(presetColor) }}
          />
        ))}
      </div>
    )}
  </PopoverContent>
</Popover>
```

### Component mapping

| Headless UI | @cytario/design | Notes |
|---|---|---|
| `<Popover>` | `<Popover>` | Wraps React Aria's `DialogTrigger` |
| `<PopoverButton>` | `<PopoverTrigger>` | Renders an unstyled button; pass your visual element as children |
| `<PopoverPanel>` | `<PopoverContent>` | The floating panel |
| `anchor="bottom start"` | `placement="bottom start"` | Same placement values |
| `{({ close }) => ...}` | `{({ close }) => ...}` | Same render prop pattern |

### PopoverContent props

| Prop | Type | Default | Description |
|---|---|---|---|
| `placement` | `Placement` | `"bottom"` | Position relative to trigger (e.g. `"bottom start"`, `"top"`, `"right"`) |
| `offset` | `number` | `8` | Gap in pixels between trigger and panel |
| `className` | `string` | — | Additional classes on the panel |
| `children` | `ReactNode \| (({ close }) => ReactNode)` | — | Static content or render function with `close` |

### Popover props (root)

| Prop | Type | Default | Description |
|---|---|---|---|
| `isOpen` | `boolean` | — | Controlled open state (omit for uncontrolled) |
| `onOpenChange` | `(isOpen: boolean) => void` | — | Called when open state changes |

### Behavior notes

- Dismisses on outside click, Escape, or programmatic `close()`
- Focus moves into the panel on open, returns to trigger on close
- Renders in a portal with `z-50`
- Styled with design tokens (`--color-surface-default`, `--color-border-default`) — adapts to dark mode automatically
- Enter/exit animations (fade + directional slide)

---

## Impact

Both gaps are now resolved. After migrating the two usages above, cytario-web can fully uninstall `@headlessui/react`, eliminating the dual headless-UI-library dependency and reducing bundle size.

### Steps to complete the migration

1. Update `@cytario/design` to the version containing these changes
2. Migrate `app/components/Controls/Switch.tsx` → use `Switch` from `@cytario/design` with the `color` prop
3. Migrate `ColorPicker.tsx` → use `Popover` / `PopoverTrigger` / `PopoverContent` from `@cytario/design`
4. Remove the local `app/components/Controls/Switch.tsx` wrapper
5. Run `pnpm remove @headlessui/react`
6. Verify the Image Viewer channel controller works correctly (toggle colors, color picker)
