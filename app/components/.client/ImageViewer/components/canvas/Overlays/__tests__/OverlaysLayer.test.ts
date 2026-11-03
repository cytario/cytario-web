import { tableFromArrays } from "apache-arrow";
import { vi } from "vitest";

import type { CellMarker, OverlayConfig } from "../../../../state/store/types";
import { AdditiveScatterplotLayer } from "../AdditiveScatterplotLayer";
import { createMarkerProps } from "../markerUniforms";
import { OverlaysLayer } from "../OverlaysLayer";

// deck.gl's TileLayer constructor pulls in the whole runtime (luma.gl, gl
// matrices, etc.) which happy-dom can't handle. We only care about the
// props object the layer was constructed with, so stub TileLayer to a
// minimal class that captures the props verbatim.
vi.mock("@deck.gl/geo-layers", () => ({
  TileLayer: class {
    props: Record<string, unknown>;
    constructor(props: Record<string, unknown>) {
      this.props = props;
    }
  },
}));

vi.mock("@deck.gl/layers", () => ({
  PolygonLayer: class {
    constructor(public props: Record<string, unknown>) {}
  },
}));

vi.mock("../AdditiveScatterplotLayer", () => ({
  AdditiveScatterplotLayer: class {
    constructor(public props: Record<string, unknown>) {}
  },
}));

vi.mock("../AdditivePolygonLayer", () => ({
  AdditivePolygonLayer: class {
    constructor(public props: Record<string, unknown>) {}
  },
}));

const showToast = vi.fn();

const makeFileMarkers = (): Record<string, CellMarker> => ({
  marker_positive_CD3: {
    color: [255, 0, 0, 1],
    count: 0,
    isVisible: true,
  },
});

const buildLayer = (overrides: Partial<Parameters<typeof OverlaysLayer>[0]> = {}) => {
  const fileMarkers = makeFileMarkers();
  const markerProps = createMarkerProps(fileMarkers, 0.8);

  const layer = OverlaysLayer({
    resourceId: "res-1",
    overlayConfig: null,
    fileMarkers,
    enabledMarkers: ["marker_positive_CD3"],
    markerProps,
    imageWidth: 1024,
    imageHeight: 1024,
    minZoom: 0,
    maxZoom: 8,
    strokeOpacity: 1,
    loadTile: vi.fn(),
    finishTile: vi.fn(),
    showToast,
    ...overrides,
  });

  return layer as unknown as { props: Record<string, unknown> };
};

describe("OverlaysLayer", () => {
  test("uses a TileLayer id that includes the resourceId to avoid collisions across overlays", () => {
    const a = buildLayer({ resourceId: "alpha" });
    const b = buildLayer({ resourceId: "beta" });

    expect(a.props.id).toBe("MarkersLayer-alpha");
    expect(b.props.id).toBe("MarkersLayer-beta");
    expect(a.props.id).not.toBe(b.props.id);
  });

  test("getTileData failures emit exactly one toast per resource+config", async () => {
    showToast.mockClear();
    const layer = buildLayer() as unknown as {
      props: {
        getTileData: (t: {
          id: string;
          index: { z: number; x: number; y: number };
        }) => Promise<unknown>;
      };
    };

    const tile = { id: "tile-1", index: { z: 0, x: 0, y: 0 } };
    await Promise.allSettled([
      layer.props.getTileData(tile),
      layer.props.getTileData(tile),
      layer.props.getTileData(tile),
    ]);
    // one failure per resource+config per store run — repeated tile errors stay silent
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  test("reconfiguration changes the cache key and updateTriggers", () => {
    const configA: OverlayConfig = {
      version: 1,
      columns: { id: "object", geometry: "geom", x: "x", y: "y" },
      classes: [{ sourceColumn: "a", label: "A", mode: "boolean" }],
    };
    const configB: OverlayConfig = {
      ...configA,
      classes: [{ sourceColumn: "b", label: "B", mode: "boolean" }],
    };

    const withA = buildLayer({ overlayConfig: configA });
    const withB = buildLayer({ overlayConfig: configB });

    const triggerA = (withA.props.updateTriggers as { getTileData: unknown[] }).getTileData;
    const triggerB = (withB.props.updateTriggers as { getTileData: unknown[] }).getTileData;
    expect(triggerA).not.toEqual(triggerB);
  });

  test("updateTriggers.getTileData is unchanged when only markerProps changes (no tile reload)", () => {
    const fileMarkers = makeFileMarkers();
    const propsBefore = createMarkerProps(fileMarkers, 0.8);
    const propsAfter = createMarkerProps(
      {
        ...fileMarkers,
        marker_positive_CD3: {
          ...fileMarkers.marker_positive_CD3,
          color: [0, 255, 0, 1],
        },
      },
      0.8,
    );

    const before = buildLayer({ markerProps: propsBefore });
    const after = buildLayer({ markerProps: propsAfter });

    const getTileDataBefore = (before.props.updateTriggers as { getTileData: unknown[] })
      .getTileData;
    const getTileDataAfter = (after.props.updateTriggers as { getTileData: unknown[] }).getTileData;

    expect(getTileDataBefore).toEqual(getTileDataAfter);
  });

  test("polygon-mode tiles without a geom column render a point sub-layer instead of throwing", () => {
    const layer = buildLayer();
    const renderSubLayers = layer.props.renderSubLayers as (
      props: Record<string, unknown>,
    ) => unknown;

    const arrowTable = tableFromArrays({
      id: [1, 2],
      x: [10.5, 20.5],
      y: [30.5, 40.5],
      marker_bitmask: [1, 1],
    });

    const subLayer = renderSubLayers({
      id: "tile-1",
      data: arrowTable,
      tile: { index: { z: 0, x: 0, y: 0 } },
    });

    expect(subLayer).toBeInstanceOf(AdditiveScatterplotLayer);
    const subLayerData = (
      subLayer as { props: { data: { attributes: { getPosition: { value: unknown } } } } }
    ).props.data;
    expect(subLayerData.attributes.getPosition.value).toEqual(
      new Float64Array([10.5, 30.5, 20.5, 40.5]),
    );
    expect((subLayer as { props: { pickable: unknown } }).props.pickable).toBe(true);
  });
});
