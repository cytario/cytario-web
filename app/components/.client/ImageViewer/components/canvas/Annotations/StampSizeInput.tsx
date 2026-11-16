import { useState } from "react";

import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { formatMetricLength, type MetricUnit } from "../Measurements/scaleBarGeometry";
import { useDisplayScale, type DisplayScale } from "../Measurements/useDisplayScale";

const inputClassName = `
  w-20 rounded-md border border-border bg-background
  px-2 py-1 text-xs text-foreground
  focus:outline-none focus:ring-1 focus:ring-primary
`;

const SIGNIFICANT_DIGITS = 3;

/** The stamp size as the input shows it: level-0 px, or a metric length in
 *  the scale bar's units rounded to three significant digits. */
const shownSize = (
  widthPx: number,
  scale: DisplayScale,
): { value: number; unit: MetricUnit | null } => {
  if (scale.unit === "pixels") return { value: Math.round(widthPx), unit: null };
  const { value, unit } = formatMetricLength(widthPx * scale.pixelSize.x);
  return { value: Number(value.toPrecision(SIGNIFICANT_DIGITS)), unit };
};

/** A positive number, with either decimal separator; null otherwise. */
const parseSize = (text: string): number | null => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
};

/** Edge length of the stamped square, stored as level-0 pixels. In metric
 *  mode it is shown in the scale bar's units — the largest one that keeps the
 *  value at least 1. Every valid keystroke applies to the stamp at once, read
 *  in the unit shown when editing began; leaving the field re-derives it from
 *  the stored size. */
export const StampSizeInput = () => {
  const stampWidthPx = useViewerStore((s) => s.annotationStampSize.widthPx);
  const setStampSize = useViewerStore((s) => s.setAnnotationStampSize);
  const scale = useDisplayScale();
  const shown = shownSize(stampWidthPx, scale);

  // While editing, the unit stays put so "200" → "2000 µm" doesn't jump to mm.
  const [editing, setEditing] = useState<{ text: string; unit: MetricUnit | null } | null>(null);
  const unit = editing ? editing.unit : shown.unit;

  const apply = (text: string) => {
    setEditing({ text, unit });
    const value = parseSize(text);
    if (value === null) return;
    if (scale.unit === "pixels" || !unit) {
      setStampSize(value, value);
      return;
    }
    // Per-axis spacing: a metric size stays square in physical dimensions even
    // when the image's pixels are anisotropic.
    const millimeters = value * unit.millimeters;
    setStampSize(millimeters / scale.pixelSize.x, millimeters / scale.pixelSize.y);
  };

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      Size
      <input
        type="text"
        inputMode="decimal"
        aria-label="Stamp size in display units"
        className={inputClassName}
        value={editing ? editing.text : String(shown.value)}
        onFocus={() => setEditing({ text: String(shown.value), unit: shown.unit })}
        onChange={(event) => apply(event.target.value)}
        onBlur={() => setEditing(null)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      {unit?.symbol ?? "px"}
    </label>
  );
};
