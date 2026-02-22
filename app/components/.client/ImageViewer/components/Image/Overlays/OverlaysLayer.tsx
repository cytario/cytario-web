import { H3 } from "@cytario/design";
import { AccessorContext, PickingInfo } from "@deck.gl/core";
import { TileLayer } from "@deck.gl/geo-layers";
import { PolygonLayer } from "@deck.gl/layers";
import { type Table } from "apache-arrow";
import { TileLoadProps } from "node_modules/@deck.gl/geo-layers/dist/tileset-2d";
import { ReactNode } from "react";

import { AdditivePolygonLayer } from "./AdditivePolygonLayer";
import { AdditiveScatterplotLayer } from "./AdditiveScatterplotLayer";
import { getPolygon } from "./getPolygon";
import { MarkerProps } from "./markerUniforms";
import { CellMarker } from "../../../state/types";
import { toastBridge } from "~/toast-bridge";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { isPointMode } from "~/utils/db/getGeomQuery";
import { getTileDataWasm } from "~/utils/db/getTileDataWasm";
import { parseResourceId } from "~/utils/resourceId";

type SetTooltip = (
  tooltip: { content: ReactNode; x: number; y: number } | null
) => void;

interface OverlaysLayerProps {
  resourceId: string;
  fileMarkers: Record<string, CellMarker>;
  enabledMarkers: string[];
  markerProps: MarkerProps;
  setTooltip?: SetTooltip;
  imageWidth: number;
  imageHeight: number;
  minZoom: number;
  maxZoom: number;
  strokeOpacity: number;
  loadTile: (id: string) => void;
  finishTile: (id: string) => void;
}

const MarkerLabel = ({ color, name }: { color: string; name: string }) => {
  return (
    <div key={name} className="flex items-center gap-2">
      <div
        className="w-4 h-4 rounded-full"
        style={{ backgroundColor: color }}
      />
      {name}
    </div>
  );
};

export const OverlaysLayer = ({
  resourceId,
  fileMarkers,
  enabledMarkers,
  markerProps,
  setTooltip,
  imageWidth,
  imageHeight,
  minZoom,
  maxZoom,
  strokeOpacity,
  loadTile,
  finishTile,
}: OverlaysLayerProps) => {
  const markerPrefix = "marker_positive_";

  const getTileData = async ({
    id,
    index,
  }: TileLoadProps): Promise<Table | null> => {
    loadTile(id);

    try {
      // Extract provider and bucket name from resourceId (format: provider/bucketName/path/to/file.csv)
      const { provider, bucketName } = parseResourceId(resourceId);
      const storeKey = `${provider}/${bucketName}`;

      // Get connection from the store using provider/bucketName key
      // Use getState() to access store outside of React component render
      const conn = useConnectionsStore.getState().connections[storeKey];
      const credentials = conn?.credentials;
      const bucketConfig = conn?.bucketConfig;

      if (!credentials) {
        throw new Error(`No credentials found for bucket: ${storeKey}`);
      }

      // Get ALL marker column names (not just enabled ones)
      const allMarkerKeys = Object.keys(fileMarkers);

      const data = await getTileDataWasm(
        resourceId,
        index,
        credentials,
        allMarkerKeys,
        bucketConfig
      );

      return data;
    } catch (error) {
      toastBridge.emit({
        variant: "error",
        message: `Error fetching tile data: ${
          (error as Error).message ?? error
        }`,
      });
      console.error("Error fetching tile data:", error);
      return null;
    } finally {
      finishTile(id);
    }
  };

  const onHover = (info: PickingInfo) => {
    if (!setTooltip) return;

    // With Arrow data, info.object is undefined - use info.index instead
    if (!info.picked || info.index === undefined) {
      return setTooltip(null);
    }

    // Get Arrow table from source layer props
    // Handle both wrapped { src: Table } (scatterplot) and direct Table (polygon) formats
    const rawData = info.sourceLayer?.props?.data;
    const arrowTable = ((rawData as { src?: Table })?.src ?? rawData) as Table;

    if (!arrowTable) {
      return setTooltip(null);
    }

    const index = info.index;

    // Access Arrow columns by index
    const idCol = arrowTable.getChild("id");
    const id = idCol?.get(index);

    // Check which markers are active for this feature using bitmask
    const bitmaskCol = arrowTable.getChild("marker_bitmask");
    if (!bitmaskCol) {
      return setTooltip(null);
    }

    const bitmask = bitmaskCol.get(index) as number;
    const allMarkerKeys = Object.keys(fileMarkers);

    const activeMarkers = enabledMarkers.filter((markerKey) => {
      const bitIndex = allMarkerKeys.indexOf(markerKey);
      if (bitIndex < 0 || bitIndex >= 32) return false;
      // Check if the bit at bitIndex is set in the bitmask
      return (bitmask & (1 << bitIndex)) !== 0;
    });

    if (activeMarkers.length === 0) {
      return setTooltip(null);
    }

    return setTooltip({
      content: (
        <div className="flex flex-col gap-1">
          <header>
            <H3 className="text-lg font-normal">ID: {String(id)}</H3>
          </header>
          {activeMarkers.map((marker) => {
            const color = `rgba(${fileMarkers[marker].color.join(",")})`;
            const name = marker.replace(markerPrefix, "");
            return <MarkerLabel key={marker} color={color} name={name} />;
          })}
        </div>
      ),
      x: info.x,
      y: info.y,
    });
  };

  const onClick = (info: PickingInfo) => {
    console.log(info);
  };

  return new TileLayer({
    id: `MarkersLayer`,
    refinementStrategy: "no-overlap",
    maxZoom,
    minZoom,
    extent: [0, 0, imageWidth, imageHeight],

    // Only recalculate when relevant data changes
    updateTriggers: {
      // Tile data only changes when the dataset or markers change
      getTileData: [resourceId, Object.keys(fileMarkers).join(",")],
      // Sublayer rendering updates
      getMarkerMask: [enabledMarkers, fileMarkers],
      getFillColor: [enabledMarkers, fileMarkers],
      getLineColor: [enabledMarkers, strokeOpacity],
      markerOpacity: [markerProps.opacity], // GPU-only update
    },
    pickable: true,
    getTileData,
    onHover,
    onClick,
    renderSubLayers: (props) => {
      const { data } = props;

      if (!data) return null;

      const pointRadius = 12;
      const pointRadiusMin = 0.1;

      // Cast to Arrow Table and extract column vectors for zero-copy access
      const arrowTable = data as Table;
      const numRows = arrowTable.numRows; // Cache this expensive call

      const xCol = arrowTable.getChild("x")!;
      const yCol = arrowTable.getChild("y")!;

      // Cache binary attributes on the tile data object to avoid recomputation
      // @ts-expect-error - Adding cache properties to Arrow table
      if (!arrowTable._cachedPositions) {
        // Optimization: Interleave directly from Arrow chunks without calling toArray()
        // For multi-chunk columns, toArray() allocates and copies each chunk into a single array
        // We skip this by iterating chunks directly - each chunk's .values is already a Float64Array
        const positionsFlat = new Float64Array(numRows * 2);

        let outputIndex = 0;
        const numChunks = xCol.data.length;

        for (let chunkIdx = 0; chunkIdx < numChunks; chunkIdx++) {
          const xChunk = xCol.data[chunkIdx];
          const yChunk = yCol.data[chunkIdx];

          // Access underlying Float64Array buffers directly (zero-copy view into chunk)
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
        // Extract pre-computed bitmask from DuckDB (contains ALL markers)
        const bitmaskCol = arrowTable.getChild("marker_bitmask");
        if (!bitmaskCol) {
          throw new Error("marker_bitmask column not found in Arrow table");
        }

        // Cache full bitmask extraction (once per tile, never invalidates)
        // @ts-expect-error - Adding cache property to Arrow table
        if (!arrowTable._cachedFullBitmask) {
          // Optimization: Extract directly from chunks without toArray()
          const fullBitmask = new Float32Array(numRows);
          let outputIndex = 0;

          for (
            let chunkIdx = 0;
            chunkIdx < bitmaskCol.data.length;
            chunkIdx++
          ) {
            const chunk = bitmaskCol.data[chunkIdx];
            const values = chunk.values as Float32Array;
            const chunkLength = chunk.length;

            // Copy chunk values directly
            for (let i = 0; i < chunkLength; i++) {
              fullBitmask[outputIndex++] = values[i];
            }
          }

          // @ts-expect-error - Cache on table
          arrowTable._cachedFullBitmask = fullBitmask;
        }

        // @ts-expect-error - Retrieve cached full bitmask
        const fullBitmask = arrowTable._cachedFullBitmask as Float32Array;

        // Build enabled bitmask from UI state
        const allMarkerKeys = Object.keys(fileMarkers);
        let enabledBitmask = 0;
        for (const markerKey of enabledMarkers) {
          const bitIndex = allMarkerKeys.indexOf(markerKey);
          if (bitIndex >= 0 && bitIndex < 32) {
            enabledBitmask |= 1 << bitIndex;
          }
        }

        // Apply enabled filter: bitwise AND each cell's bitmask with enabled mask
        const markerMasks = new Float32Array(numRows);
        for (let i = 0; i < numRows; i++) {
          markerMasks[i] = fullBitmask[i] & enabledBitmask;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any = {
          src: arrowTable, // For tooltip hover access
          length: numRows,
          attributes: {
            getPosition: { value: positionsFlat, size: 2 },
            getMarkerMask: { value: markerMasks, size: 1 },
          },
        };

        return new AdditiveScatterplotLayer({
          ...props,
          data,
          getRadius: pointRadius,
          radiusMinPixels: pointRadiusMin,
          // @ts-expect-error - Custom props not in deck.gl's base layer types
          markerProps,
          pickable: true,
        });
      }

      // Polygon mode: Extract and filter bitmask same as points
      const bitmaskCol = arrowTable.getChild("marker_bitmask");
      if (!bitmaskCol) {
        throw new Error("marker_bitmask column not found in Arrow table");
      }

      // Cache full bitmask extraction (once per tile, never invalidates)
      // @ts-expect-error - Adding cache property to Arrow table
      if (!arrowTable._cachedFullBitmask) {
        // Optimization: Extract directly from chunks without toArray()
        const fullBitmask = new Float32Array(numRows);
        let outputIndex = 0;

        for (let chunkIdx = 0; chunkIdx < bitmaskCol.data.length; chunkIdx++) {
          const chunk = bitmaskCol.data[chunkIdx];
          const values = chunk.values as Float32Array;
          const chunkLength = chunk.length;

          // Copy chunk values directly
          for (let i = 0; i < chunkLength; i++) {
            fullBitmask[outputIndex++] = values[i];
          }
        }

        // @ts-expect-error - Cache on table
        arrowTable._cachedFullBitmask = fullBitmask;
      }

      // @ts-expect-error - Retrieve cached full bitmask
      const fullBitmask = arrowTable._cachedFullBitmask as Float32Array;

      // Build enabled bitmask from UI state
      const allMarkerKeys = Object.keys(fileMarkers);
      let enabledBitmask = 0;
      for (const markerKey of enabledMarkers) {
        const bitIndex = allMarkerKeys.indexOf(markerKey);
        if (bitIndex >= 0 && bitIndex < 32) {
          enabledBitmask |= 1 << bitIndex;
        }
      }

      // Apply enabled filter: bitwise AND each polygon's bitmask with enabled mask
      const markerMasks = new Float32Array(numRows);
      for (let i = 0; i < numRows; i++) {
        markerMasks[i] = fullBitmask[i] & enabledBitmask;
      }

      const getLineWidth = 3;
      const lineWidthMinPixels = 1;

      // Create polygon accessor function
      const polygonAccessor = getPolygon(arrowTable);

      const fillLayer = new AdditivePolygonLayer({
        ...props,
        id: `${props.id}-fill`,
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

      // Separate stroke layer (SolidPolygonLayer doesn't support strokes)
      // Always create both layers to keep structure consistent (avoids tile reloads)
      const strokeLayer = new PolygonLayer({
        ...props,
        id: `${props.id}-stroke`,
        data: arrowTable,
        getPolygon: (_d: unknown, context: AccessorContext<unknown>) =>
          polygonAccessor(context.index, context),
        // Only show strokes for enabled markers when strokeOpacity > 0
        getLineColor: (_d: unknown, { index }: { index: number }) => {
          if (strokeOpacity === 0 || markerMasks[index] === 0) {
            return [0, 0, 0, 0];
          }
          return [255, 255, 255, 255];
        },
        getLineWidth: getLineWidth,
        lineWidthMinPixels,
        filled: false,
        stroked: true,
        pickable: false,
        updateTriggers: {
          getLineColor: [strokeOpacity, enabledMarkers],
        },
      });

      return [fillLayer, strokeLayer];
    },

    onTileError: (error) => {
      toastBridge.emit({
        variant: "error",
        message: `Error loading tile: ${error.message}`,
      });
      console.error("Error loading tile:", error);
    },
  });
};
