import { useMemo } from "react";

import { physicalPixelSize, type PhysicalPixelSize } from "./utils";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

/** The unit the viewer's measurement surfaces render in. Metric carries the
 *  image's physical pixel size, so no surface can show a metric value the
 *  metadata does not support. */
export type DisplayScale =
  | { unit: "metric"; pixelSize: PhysicalPixelSize }
  | {
      unit: "pixels";
      /** Whether the image has a physical scale the user could switch to. */
      metricAvailable: boolean;
    };

/** The user's preferred unit, falling back to pixels when the image has no
 *  trustworthy physical pixel size. */
export const useDisplayScale = (): DisplayScale => {
  const metadata = useViewerStore(select.metadata);
  const preferredUnit = useViewerDisplayStore((state) => state.displayUnit);
  const pixelSize = useMemo(
    () => (metadata ? physicalPixelSize(metadata.Pixels) : null),
    [metadata],
  );

  return preferredUnit === "metric" && pixelSize
    ? { unit: "metric", pixelSize }
    : { unit: "pixels", metricAvailable: pixelSize !== null };
};
