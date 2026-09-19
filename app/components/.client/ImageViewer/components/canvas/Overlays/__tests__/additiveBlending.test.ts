import { vi } from "vitest";

import type { CellMarker } from "../../../../state/store/types";
import { additiveBlendParameters } from "../additiveBlending.glsl";
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

vi.mock("~/toast-bridge", () => ({
  toastBridge: { emit: vi.fn() },
}));

const makeFileMarkers = (): Record<string, CellMarker> => ({
  marker_positive_CD3: {
    color: [255, 0, 0, 1],
    count: 0,
    isVisible: true,
  },
});

const buildLayer = () => {
  const fileMarkers = makeFileMarkers();
  const layer = OverlaysLayer({
    resourceId: "res-1",
    overlayConfig: null,
    fileMarkers,
    enabledMarkers: ["marker_positive_CD3"],
    markerProps: createMarkerProps(fileMarkers, 0.5),
    imageWidth: 1024,
    imageHeight: 1024,
    minZoom: 0,
    maxZoom: 8,
    strokeOpacity: 1,
    loadTile: vi.fn(),
    finishTile: vi.fn(),
  });

  return layer as unknown as {
    props: { renderSubLayers: (props: Record<string, unknown>) => unknown };
  };
};

const emptyArrowTable = { numRows: 0, getChild: () => ({ data: [] }) };

describe("OverlaysLayer additive blending", () => {
  test("fill sublayers receive the additive blend parameters (parent props must not clobber them)", () => {
    const layer = buildLayer();

    // Polygon mode (z >= -2): [fill, stroke].
    const [fill] = layer.props.renderSubLayers({
      id: "MarkersLayer-res-1-tile",
      data: emptyArrowTable,
      tile: { index: { z: 0, x: 0, y: 0 } },
    }) as { props: { parameters: unknown } }[];

    expect(fill.props.parameters).toEqual(additiveBlendParameters);
  });

  test("point sublayers receive the additive blend parameters", () => {
    const layer = buildLayer();

    // Point mode (z < -2): single AdditiveScatterplotLayer.
    const result = layer.props.renderSubLayers({
      id: "MarkersLayer-res-1-tile",
      data: emptyArrowTable,
      tile: { index: { z: -3, x: 0, y: 0 } },
    }) as { props: { parameters: unknown } };
    const points = Array.isArray(result) ? result[0] : result;

    expect(points.props.parameters).toEqual(additiveBlendParameters);
  });

  test("the additive parameters accumulate source color (src-alpha onto one)", () => {
    expect(additiveBlendParameters).toMatchObject({
      blend: true,
      blendColorOperation: "add",
      blendColorSrcFactor: "src-alpha",
      blendColorDstFactor: "one",
      blendAlphaOperation: "add",
      blendAlphaSrcFactor: "one",
      blendAlphaDstFactor: "one",
    });
  });
});
