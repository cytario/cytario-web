import { Slider } from "@cytario/design";

/** Compact section-action slider over the design system's Slider: 0–1 value,
 *  no label/output chrome — the section header row supplies the context. */
export function SectionSlider({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  "aria-label": string;
}) {
  return (
    <Slider
      aria-label={ariaLabel}
      className="w-20 px-2"
      minValue={0}
      maxValue={1}
      step={0.01}
      value={value}
      onChange={(next) => onChange(Array.isArray(next) ? (next[0] ?? 0) : next)}
    />
  );
}
