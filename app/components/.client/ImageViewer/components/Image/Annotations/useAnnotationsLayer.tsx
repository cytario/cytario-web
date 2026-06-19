import { GeoJsonLayer } from "@deck.gl/layers";
import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useMemo, useState } from "react";

import { RGB, RGBA } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import {
  getAnnotationsWasm,
  type AnnotationFeature,
  type AnnotationProperties,
} from "~/utils/db/getAnnotationsWasm";

const DEFAULT_COLOR: RGB = [120, 120, 120];

const classColor = (feature: AnnotationFeature): RGB =>
  feature.properties?.classification?.color ?? DEFAULT_COLOR;

const withAlpha = ([r, g, b]: RGB, alpha: number): RGBA => [r, g, b, alpha];

/**
 * Reads the image's annotation sidecars and returns a deck.gl `GeoJsonLayer`
 * rendering them. Coordinates are level-0 pixel space, matching the viewer's
 * `OrthographicView` (flipY) — no transform needed. Read-only for now.
 */
export const useAnnotationsLayer = (imagePanelId: number) => {
  const resourceId = useViewerStore((s) => s.id);
  const [features, setFeatures] = useState<AnnotationFeature[]>([]);

  useEffect(() => {
    let cancelled = false;
    getAnnotationsWasm(resourceId)
      .then((next) => {
        if (!cancelled) setFeatures(next);
      })
      .catch((error) => {
        console.error("[useAnnotationsLayer] failed to load annotations:", error);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  return useMemo(() => {
    if (features.length === 0) return null;
    const data: FeatureCollection<Geometry, AnnotationProperties> = {
      type: "FeatureCollection",
      features,
    };
    return new GeoJsonLayer<AnnotationProperties>({
      id: `annotations-${imagePanelId}`,
      data,
      pickable: true,
      filled: true,
      stroked: true,
      getFillColor: (f) => withAlpha(classColor(f), 60),
      getLineColor: (f) => withAlpha(classColor(f), 255),
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pointRadiusMinPixels: 3,
    });
  }, [features, imagePanelId]);
};
