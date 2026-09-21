import { useState } from "react";

import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { absoluteToMetricFactory, metricToAbsoluteFactory } from "../Measurements/utils";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

const inputClassName = `
  w-20 rounded-md border border-border bg-background
  px-2 py-1 text-xs text-foreground
  focus:outline-none focus:ring-1 focus:ring-primary
`;

/** Edge length of the stamped square, entered in nanometers (metric) or
 *  level-0 pixels and stored as level-0 pixels. The displayed value re-derives
 *  from the stored pixels when the unit flips. */
export const StampSizeInput = () => {
  const metadata = useViewerStore(select.metadata);
  const stampWidthPx = useViewerStore((s) => s.annotationStampSize.widthPx);
  const setStampSize = useViewerStore((s) => s.setAnnotationStampSize);
  const displayUnit = useViewerDisplayStore((s) => s.displayUnit);

  // The metric variant of the input is always nanometers, independent of the
  // image's metadata unit; the factories normalize to mm.
  const metadataUnit = metadata?.Pixels.PhysicalSizeXUnit ?? "µm";
  const nanometersPerMillimeter = 1_000_000;
  // Per-axis spacing: a nanometer size stays square in physical dimensions even
  // when the image's pixels are anisotropic.
  const spacingX = metadata?.Pixels.PhysicalSizeX ?? 1;
  const spacingY = metadata?.Pixels.PhysicalSizeY ?? spacingX;

  const toDisplay = (widthPx: number): number =>
    displayUnit === "pixels"
      ? widthPx
      : Math.round(
          absoluteToMetricFactory(spacingX, metadataUnit)(widthPx) * nanometersPerMillimeter,
        );

  const [draft, setDraft] = useState(String(toDisplay(stampWidthPx)));
  const [draftSync, setDraftSync] = useState({ sizePx: stampWidthPx, unit: displayUnit });
  if (draftSync.sizePx !== stampWidthPx || draftSync.unit !== displayUnit) {
    // Re-derive the draft when the stored size or the unit flips; the user's
    // in-progress typing wins until commit.
    setDraftSync({ sizePx: stampWidthPx, unit: displayUnit });
    setDraft(String(toDisplay(stampWidthPx)));
  }

  const commit = () => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value <= 0) {
      setDraft(String(toDisplay(stampWidthPx)));
      return;
    }
    const nanometersToLevel0Px = (spacing: number) =>
      metricToAbsoluteFactory(spacing, metadataUnit)(value / nanometersPerMillimeter);
    setStampSize(
      displayUnit === "pixels" ? value : nanometersToLevel0Px(spacingX),
      displayUnit === "pixels" ? value : nanometersToLevel0Px(spacingY),
    );
  };

  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      Size
      <input
        type="number"
        min={1}
        aria-label="Stamp size in display units"
        className={inputClassName}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
      />
      {displayUnit === "pixels" ? "px" : "nm"}
    </label>
  );
};
