import { loadOmeZarrMultiscalesData, getVivSelectionAxisSizes } from "@spatialdata/avivatorish";
import { useEffect } from "react";

import { elementId, type SpatialElementConfig } from "../state/createSpatialDataViewerStore";

/** Raster element kinds a z-plane selection applies to. */
export function isZSelectable(elementType: SpatialElementConfig["elementType"]): boolean {
  return elementType === "image" || elementType === "labels";
}

/** A z plane exists only when the loader-resolved plane count exceeds one. */
export function isZBearing(config: Pick<SpatialElementConfig, "elementType" | "zSize">): boolean {
  return isZSelectable(config.elementType) && (config.zSize ?? 1) > 1;
}

const zSizeFromLoader = (loader: unknown): number | undefined => {
  // Viv returns one ZarrPixelSource per resolution level; the full-resolution
  // level carries the axis sizes.
  const level0 = Array.isArray(loader) ? loader[0] : undefined;
  const labels: string[] | undefined = level0?.labels;
  const shape: number[] | undefined = level0?.shape;
  if (!labels || !shape) return undefined;
  return getVivSelectionAxisSizes(labels, shape).z;
};

/**
 * Resolve each raster element's z plane count from its pixel source.
 *
 * Runs when the element key set changes; elements already resolved (store
 * re-seeds keep their value out of the work set) and non-raster kinds are
 * skipped. Per-element failures leave that element's zSize undefined without
 * aborting the others.
 */
export function useResolveZSizes(
  elements: Record<string, SpatialElementConfig>,
  setElementZSize: (id: string, zSize: number) => void,
): void {
  const elementKeySet = Object.keys(elements).join(",");

  useEffect(() => {
    let cancelled = false;

    for (const config of Object.values(elements)) {
      if (!isZSelectable(config.elementType) || config.zSize !== undefined) continue;

      const id = elementId(config.elementType, config.elementKey);
      const store = config.getStore?.();
      if (!store) continue;

      loadOmeZarrMultiscalesData({ store })
        .then((loader) => {
          if (cancelled) return;
          const zSize = zSizeFromLoader(loader);
          // zSize 0 is never meaningful; leave undefined so the element keeps
          // failing visible instead of silently collapsing its slider to 0.
          if (zSize && zSize > 0) setElementZSize(id, zSize);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          console.error(`Failed to resolve z axis size for ${config.elementKey}:`, error);
        });
    }

    return () => {
      cancelled = true;
    };
    // elements is intentionally not a dep: elementKeySet re-runs the effect on
    // store re-seeds while opacity/visibility/zIndex updates do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementKeySet, setElementZSize]);
}
