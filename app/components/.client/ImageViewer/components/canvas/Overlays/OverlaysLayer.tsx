import { AccessorContext } from "@deck.gl/core";
import { type _TileLoadProps as TileLoadProps, TileLayer } from "@deck.gl/geo-layers";
import { PolygonLayer } from "@deck.gl/layers";
import { type Table } from "apache-arrow";

import { additiveBlendParameters } from "./additiveBlending.glsl";
import { AdditivePolygonLayer } from "./AdditivePolygonLayer";
import { AdditiveScatterplotLayer } from "./AdditiveScatterplotLayer";
import { getPolygon } from "./getPolygon";
import { blendMarkerColor, MarkerProps } from "./markerUniforms";
import { type CellMarker, type OverlayConfig } from "../../../state/store/types";
import { OVERLAY_CACHE_NS, getCachedTile } from "../../../utils/sharedTileCache";
import { toastBridge } from "~/toast-bridge";
import { isPointMode } from "~/utils/db/getGeomQuery";
import { getTileDataWasm } from "~/utils/db/getTileDataWasm";
import { overlayConfigHash } from "~/utils/db/overlayConfig";
import { shouldReportOverlayError } from "~/utils/db/overlayErrorOnce";

interface OverlaysLayerProps {
  resourceId: string;
  overlayConfig: OverlayConfig | null;
  fileMarkers: Record<string, CellMarker>;
  enabledMarkers: string[];
  markerProps: MarkerProps;
  imageWidth: number;
  imageHeight: number;
  minZoom: number;
  maxZoom: number;
  strokeOpacity: number;
  loadTile: (id: string) => void;
  finishTile: (id: string) => void;
}

export const OverlaysLayer = ({
  resourceId,
  overlayConfig,
  fileMarkers,
  enabledMarkers,
  markerProps,
  imageWidth,
  imageHeight,
  minZoom,
  maxZoom,
  strokeOpacity,
  loadTile,
  finishTile,
}: OverlaysLayerProps) => {
  // Config participates in cache/error identity: reconfiguring must invalidate cached
  // tiles and re-arm the one-shot error toast.
  const configHash = overlayConfigHash(overlayConfig);

  const reportTileError = (message: string) => {
    if (!shouldReportOverlayError(resourceId, configHash)) return;
    toastBridge.emit({ variant: "error", message });
  };

  const getTileData = async ({ id, index }: TileLoadProps): Promise<Table | null> => {
    loadTile(id);

    try {
      const allMarkerKeys = Object.keys(fileMarkers);

      // Shared across panels: the 2nd ImagePanel reuses the 1st panel's DuckDB result.
      const cacheKey = `${resourceId}|${index.z}-${index.x}-${index.y}|${allMarkerKeys.join(",")}|${configHash}`;
      const data = await getCachedTile(OVERLAY_CACHE_NS, cacheKey, () =>
        getTileDataWasm(resourceId, index, allMarkerKeys, overlayConfig),
      );

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return null;
      }
      reportTileError(`Error fetching tile data: ${(error as Error).message ?? error}`);
      console.error("Error fetching tile data:", error);
      return null;
    } finally {
      finishTile(id);
    }
  };

  return new TileLayer({
    // Unique id per overlay resource — multiple overlays would otherwise collide and
    // deck.gl would reconcile them as the same layer, clobbering each other.
    id: `MarkersLayer-${resourceId}`,
    refinementStrategy: "no-overlap",
    maxZoom,
    minZoom,
    extent: [0, 0, imageWidth, imageHeight],

    updateTriggers: {
      getTileData: [resourceId, Object.keys(fileMarkers).join(","), configHash],
      getMarkerMask: [enabledMarkers, fileMarkers],
      getFillColor: [enabledMarkers, fileMarkers],
      getLineColor: [enabledMarkers, strokeOpacity, markerProps],
    },
    pickable: true,
    getTileData,
    renderSubLayers: (props) => {
      const { data } = props;

      if (!data) return null;

      const pointRadius = 12;
      const pointRadiusMin = 0.1;

      // Interleave Arrow chunks directly (toArray() would copy each chunk) for zero-copy access.
      const arrowTable = data as Table;
      const numRows = arrowTable.numRows;

      const xCol = arrowTable.getChild("x")!;
      const yCol = arrowTable.getChild("y")!;

      // @ts-expect-error - Adding cache properties to Arrow table
      if (!arrowTable._cachedPositions) {
        const positionsFlat = new Float64Array(numRows * 2);

        let outputIndex = 0;
        const numChunks = xCol.data.length;

        for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
          const xChunk = xCol.data[chunkIdx];
          const yChunk = yCol.data[chunkIdx];

          const xValues = xChunk.values as Float64Array;
          const yValues = yChunk.values as Float64Array;
          const chunkLength = xChunk.length;

          // Interleave this chunk's x,y values
          for (let i = 0; i < chunkLength; i++) {
            positionsFlat[outputIndex++] = xValues[i];
            positionsFlat[outputIndex++] = yValues[i];
          }
        }

        // @ts-expect-error - Cache on table
        arrowTable._cachedPositions = positionsFlat;
      }

      // @ts-expect-error - Retrieve cached positions
      const positionsFlat = arrowTable._cachedPositions as Float64Array;

      if (isPointMode(props.tile.index.z)) {
        const bitmaskCol = arrowTable.getChild("marker_bitmask");
        if (!bitmaskCol) {
          throw new Error("marker_bitmask column not found in Arrow table");
        }

        // @ts-expect-error - Adding cache property to Arrow table
        if (!arrowTable._cachedFullBitmask) {
          const fullBitmask = new Float32Array(numRows);
          let outputIndex = 0;

          for (let chunkIdx = 0; chunkIdx < bitmaskCol.data.length; chunkIdx++) {
            const chunk = bitmaskCol.data[chunkIdx];
            const values = chunk.values as Float32Array;
            const chunkLength = chunk.length;

            for (let i = 0; i < chunkLength; i++) {
              fullBitmask[outputIndex++] = values[i];
            }
          }

          // @ts-expect-error - Cache on table
          arrowTable._cachedFullBitmask = fullBitmask;
        }

        // @ts-expect-error - Retrieve cached full bitmask
        const fullBitmask = arrowTable._cachedFullBitmask as Float32Array;

        // Bitmask of the enabled markers in UI state.
        const allMarkerKeys = Object.keys(fileMarkers);
        let enabledBitmask = 0;
        for (const markerKey of enabledMarkers) {
          const bitIndex = allMarkerKeys.indexOf(markerKey);
          if (bitIndex >= 0 && bitIndex < 32) {
            enabledBitmask |= 1 << bitIndex;
          }
        }

        const markerMasks = new Float32Array(numRows);
        for (let i = 0; i < numRows; i++) {
          markerMasks[i] = fullBitmask[i] & enabledBitmask;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {
          src: arrowTable, // for tooltip hover access
          length: numRows,
          attributes: {
            getPosition: { value: positionsFlat, size: 2 },
            getMarkerMask: { value: markerMasks, size: 1 },
          },
        };

        // Explicit: the TileLayer's defaulted `parameters: {}` would clobber a
        // subclass defaultProps value through the `...props` spread.
        return new AdditiveScatterplotLayer({
          ...props,
          parameters: additiveBlendParameters,
          data,
          getRadius: pointRadius,
          radiusMinPixels: pointRadiusMin,
          // @ts-expect-error - Custom props not in deck.gl's base layer types
          markerProps,
          pickable: true,
        });
      }

      // Polygon mode: same bitmask extraction and enabled filter as points.
      const bitmaskCol = arrowTable.getChild("marker_bitmask");
      if (!bitmaskCol) {
        throw new Error("marker_bitmask column not found in Arrow table");
      }

      // @ts-expect-error - Adding cache property to Arrow table
      if (!arrowTable._cachedFullBitmask) {
        const fullBitmask = new Float32Array(numRows);
        let outputIndex = 0;

        for (let chunkIdx = 0; chunkIdx < bitmaskCol.data.length; chunkIdx++) {
          const chunk = bitmaskCol.data[chunkIdx];
          const values = chunk.values as Float32Array;
          const chunkLength = chunk.length;

          for (let i = 0; i < chunkLength; i++) {
            fullBitmask[outputIndex++] = values[i];
          }
        }

        // @ts-expect-error - Cache on table
        arrowTable._cachedFullBitmask = fullBitmask;
      }

      // @ts-expect-error - Retrieve cached full bitmask
      const fullBitmask = arrowTable._cachedFullBitmask as Float32Array;

      // Bitmask of the enabled markers in UI state.
      const allMarkerKeys = Object.keys(fileMarkers);
      let enabledBitmask = 0;
      for (const markerKey of enabledMarkers) {
        const bitIndex = allMarkerKeys.indexOf(markerKey);
        if (bitIndex >= 0 && bitIndex < 32) {
          enabledBitmask |= 1 << bitIndex;
        }
      }

      const markerMasks = new Float32Array(numRows);
      for (let i = 0; i < numRows; i++) {
        markerMasks[i] = fullBitmask[i] & enabledBitmask;
      }

      const getLineWidth = 1;
      const lineWidthMinPixels = 1;

      const polygonAccessor = getPolygon(arrowTable);

      const fillLayer = new AdditivePolygonLayer({
        ...props,
        id: `${props.id}-fill`,
        parameters: additiveBlendParameters,
        data: arrowTable,
        getPolygon: (_d: unknown, context: AccessorContext<unknown>) =>
          polygonAccessor(context.index, context),
        // @ts-expect-error - Custom props not in deck.gl's base layer types
        getMarkerMask: (_d: unknown, { index }: { index: number }) => {
          return markerMasks[index];
        },
        markerProps,
        filled: true,
        pickable: true,
      });

      // Separate stroke layer (SolidPolygonLayer doesn't support strokes); both layers are
      // always created to keep structure consistent and avoid tile reloads.
      const strokeLayer = new PolygonLayer({
        ...props,
        id: `${props.id}-stroke`,
        data: arrowTable,
        getPolygon: (_d: unknown, context: AccessorContext<unknown>) =>
          polygonAccessor(context.index, context),
        getLineColor: (_d: unknown, { index }: { index: number }) => {
          if (strokeOpacity === 0 || markerMasks[index] === 0) {
            return [0, 0, 0, 0];
          }
          return blendMarkerColor(markerProps, markerMasks[index]);
        },
        getLineWidth: getLineWidth,
        lineWidthMinPixels,
        filled: false,
        stroked: true,
        pickable: false,
        updateTriggers: {
          getLineColor: [strokeOpacity, enabledMarkers, markerProps],
        },
      });

      return [fillLayer, strokeLayer];
    },

    onTileError: (error) => {
      if (error?.name === "AbortError") return;
      reportTileError(`Error loading tile: ${error.message}`);
      console.error("Error loading tile:", error);
    },
  });
};
