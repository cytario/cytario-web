# UI Issues in @cytario/design

Visual regressions identified after migrating from custom components / @headlessui/react to @cytario/design.

---

## 1. H1 Heading: Missing Responsive Sizing and Font Weight Mismatch

**Component:** `H1` (from `Heading`)

**Expected (pre-migration):**
```
font-bold text-2xl sm:text-3xl md:text-4xl
```
- `font-bold` (700)
- Responsive: `text-2xl` on mobile, `text-3xl` on sm, `text-4xl` on md+

**Actual (design system):**
```
font-semibold text-3xl
```
- `font-semibold` (600) instead of `font-bold` (700)
- Fixed `text-3xl` at all breakpoints (no responsive scaling)

**Impact:** The "Your Storage Connections" heading on the buckets page appears noticeably smaller on medium+ screens (text-3xl vs text-4xl) and lighter weight (semibold vs bold).

**Workaround applied in cytario-web:** Replaced `<H1>` with a plain `<h1>` element using the original responsive classes (`font-bold text-2xl sm:text-3xl md:text-4xl`) in `DirectoryView.tsx`. The design system `H1` cannot be overridden via `className` because `Heading` uses `.join(" ")` instead of `twMerge` for class composition, so the component's internal `text-3xl` always wins over an external `text-2xl` at the base breakpoint.

**Suggested design system fix:**
1. **Use `twMerge` instead of `.join(" ")`** for class composition in `Heading` (and all components). This is the most impactful fix -- it allows consumers to override any style via `className` without conflicts.
2. Add a `size` option larger than `2xl` (e.g., `3xl` mapping to `text-4xl`)
3. Support responsive size arrays (e.g., `size={["2xl", "3xl", "4xl"]}`)
4. Use `font-bold` instead of `font-semibold` for H1 to better match common heading expectations

---

## 2. ToggleButton: No Bordered/Square Variant for Toggle Groups

**Component:** `ToggleButton`

**Expected (pre-migration):**
```
w-8 h-8                          -- fixed square dimensions
border border-slate-300           -- visible border
bg-slate-700 text-white           -- active: dark background, white text
bg-white hover:bg-slate-300       -- inactive: white background
(no border-radius)                -- sharp corners
```

**Actual (design system):**
```
px-3 py-1.5 text-sm               -- padding-based sizing (not square)
rounded-[var(--border-radius-md)]  -- rounded corners
bg-transparent                     -- inactive: no background
bg-[var(--color-neutral-200)]      -- active: subtle gray background
(no border)                        -- no visible border
```

**Impact:** The view mode toggle (list/grid-sm/grid-md/grid-lg) buttons appear unstyled and lack the visual affordance of a traditional toggle button group. The active state has very low contrast compared to the previous dark-on-white treatment.

**Why className override is not sufficient:** The `ToggleButton` component uses a render function for className that conditionally applies selected/unselected styles internally. External `className` overrides cannot conditionally change styles based on `isSelected` state, making it impossible to restore the high-contrast active/inactive distinction from outside the component.

**Workaround applied in cytario-web:** Reverted to a custom `ViewModeButton` component with the original styling in `ViewModeToggle.tsx`.

**Suggested design system fix:** Add an `outlined` or `bordered` variant to `ToggleButton` that provides:
- A visible border
- High-contrast selected state (dark background + white text)
- Support for fixed square dimensions (e.g., `isSquare` prop or icon-only detection)
- Optionally, a `ToggleButtonGroup` compound component that handles mutual exclusion and removes inter-button borders for a seamless group appearance

---

## 3. ButtonLink: No "Neutral" / "White" Variant

**Component:** `ButtonLink`

**Expected (pre-migration, `theme="white"`):**
```
bg-white hover:bg-slate-50
text-inherit
border border-inherit
```

**Actual (design system, `variant="secondary"`):**
```
bg-transparent
text-[var(--color-action-secondary)]   -- purple/brand colored text
border border-[var(--color-border-brand)]  -- purple/brand colored border
hover:bg-[var(--color-purple-50)]
```

**Impact:** The "Connect Storage" and "Access with Cyberduck" buttons changed from a neutral white appearance (matching the page chrome) to a purple-branded appearance. This may be an intentional design upgrade, but it differs from the pre-migration visual.

**No workaround applied:** The `secondary` variant is acceptable as a design evolution. If the neutral white style is needed, a `variant="outline"` or `variant="neutral"` should be added to the design system.

**Suggested design system fix:** Consider adding a neutral/outline variant:
```typescript
neutral: [
  "bg-white text-slate-700",
  "border border-slate-300",
  "hover:bg-slate-50",
  "pressed:bg-slate-100",
].join(" "),
```
