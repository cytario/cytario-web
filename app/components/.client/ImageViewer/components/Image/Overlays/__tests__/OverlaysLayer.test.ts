import { vi } from "vitest";

import type { CellMarker } from "../../../../state/store/types";
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

const makeFileMarkers = (): Record<string, CellMarker> => ({
  marker_positive_CD3: {
    color: [255, 0, 0, 1],
    count: 0,
    isVisible: true,
  },
});

const buildLayer = (
  overrides: Partial<Parameters<typeof OverlaysLayer>[0]> = {}
) => {
  const fileMarkers = makeFileMarkers();
  const markerProps = createMarkerProps(fileMarkers, 0.8);

  const layer = OverlaysLayer({
    resourceId: "res-1",
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
      0.8
    );

    const before = buildLayer({ markerProps: propsBefore });
    const after = buildLayer({ markerProps: propsAfter });

    const getTileDataBefore = (
      before.props.updateTriggers as { getTileData: unknown[] }
    ).getTileData;
    const getTileDataAfter = (
      after.props.updateTriggers as { getTileData: unknown[] }
    ).getTileData;

    expect(getTileDataBefore).toEqual(getTileDataAfter);
  });
});
