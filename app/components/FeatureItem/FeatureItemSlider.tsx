/** Opacity slider for a FeatureItem header's `actions` slot. Maps 0–1 ↔ 0–100. */
export function FeatureItemSlider({
  value,
  onChange,
  "aria-label": ariaLabel,
}: {
  value: number;
  onChange: (value: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="range"
      min={0}
      max={100}
      aria-label={ariaLabel}
      className="w-20 h-4"
      value={Math.round(value * 100)}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
    />
  );
}
