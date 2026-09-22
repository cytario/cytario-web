import { vi } from "vitest";

import type { CellMarker } from "../../../../state/store/types";
import {
  additiveBlendParameters,
  compositeBlendParameters,
  compositeFragmentShader,
} from "../additiveBlending.glsl";
import { createMarkerProps } from "../markerUniforms";
import { OverlayCompositeEffect } from "../OverlayComposite";
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
  test("polygon fill and stroke sublayers both receive the additive blend parameters", () => {
    const layer = buildLayer();

    const [fill, stroke] = layer.props.renderSubLayers({
      id: "MarkersLayer-res-1-tile",
      data: emptyArrowTable,
      tile: { index: { z: 0, x: 0, y: 0 } },
    }) as { props: { parameters: unknown } }[];

    expect(fill.props.parameters).toEqual(additiveBlendParameters);
    // Strokes accumulate across overlay files too — the last-drawn file must
    // not overwrite the earlier ones.
    expect(stroke.props.parameters).toEqual(additiveBlendParameters);
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

  test("the composite parameters premultiplied-over blend preserve the base (one onto one-minus-src-alpha)", () => {
    expect(compositeBlendParameters).toMatchObject({
      blend: true,
      blendColorOperation: "add",
      blendColorSrcFactor: "one",
      blendColorDstFactor: "one-minus-src-alpha",
      blendAlphaOperation: "add",
      blendAlphaSrcFactor: "one",
      blendAlphaDstFactor: "one-minus-src-alpha",
    });
  });

  test("the composite fragment shader samples the offscreen texture", () => {
    // luma's assembler strips the first source line unconditionally —
    // `#version` must be line 1 or the shader fails to compile.
    expect(compositeFragmentShader.startsWith("#version 300 es")).toBe(true);
    expect(compositeFragmentShader).toContain("uniform sampler2D uFill;");
    expect(compositeFragmentShader).toContain("fragColor = texture(uFill, uv);");
  });

  test("the composite effect sizes its framebuffer from the drawing buffer, not the 1x1 default", () => {
    const created: { texture: number[]; framebuffer: number[] } = {
      texture: [],
      framebuffer: [],
    };
    const device = {
      canvasContext: { getDrawingBufferSize: () => [800, 600] },
      createTexture: (props: { width: number; height: number }) => {
        created.texture.push(props.width, props.height);
        return { destroy: () => {} };
      },
      createFramebuffer: (props: { width: number; height: number }) => {
        created.framebuffer.push(props.width, props.height);
        return { destroy: () => {} };
      },
    };
    const result: import("../OverlayComposite").OverlayCompositeResult = {};
    const effect = new OverlayCompositeEffect(result);
    effect.setup({ device } as never);
    const pass = (effect as unknown as { pass: { render: () => void } }).pass;
    pass.render = () => {};
    const renderOpts = {
      layers: [{ id: "MarkersLayer-res-1" }],
      viewports: [],
    } as never;

    // Without explicit width/height luma defaults the framebuffer to 1x1 and
    // deck's getGLViewport shifts the offscreen render below the FBO.
    effect.preRender(renderOpts);
    expect(created.framebuffer).toEqual([800, 600]);
    expect(result.texture).toBeDefined();

    // Same drawing-buffer size — the target is reused, not reallocated.
    effect.preRender(renderOpts);
    expect(created.framebuffer).toEqual([800, 600]);

    effect.cleanup();
    expect(result.texture).toBeUndefined();
  });
});
