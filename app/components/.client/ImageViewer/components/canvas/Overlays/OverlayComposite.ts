// deck.gl's LayersPass is exported only under this underscore name; stable
// across 9.x but re-check on any deck.gl major bump.
import { _LayersPass, Layer } from "@deck.gl/core";
import type { Effect, EffectContext, LayersPassRenderOptions } from "@deck.gl/core";
import type { Device, Framebuffer, Texture } from "@luma.gl/core";
import { ClipSpace } from "@luma.gl/engine";

import { compositeBlendParameters, compositeFragmentShader } from "./additiveBlending.glsl";

/** Layer-id prefix for every overlay provider — the composite effect filters by it. */
export const OVERLAYS_ID_PREFIX = "MarkersLayer-";
export const OVERLAY_COMPOSITE_LAYER_ID = "overlays-composite";

/** Mutable handoff between the effect (producer) and the composite layer (consumer). */
export interface OverlayCompositeResult {
  texture?: Texture;
}

/**
 * Fullscreen layer that samples the offscreen overlay texture and premultiplied-over
 * blends it onto the opaque viv base. The base layer is left untouched — the additive
 * fills, which wash out to white on bright bases, are instead accumulated offscreen and
 * composited with `one`/`one-minus-src-alpha`.
 */
export class OverlayCompositeLayer extends Layer<{ result: OverlayCompositeResult }> {
  static layerName = "OverlayCompositeLayer";
  // `applyModelParameters` sets the models' parameters from `props.parameters`; the default
  // `{}` would wipe the ClipSpace blend, so the compositing blend is the layer default.
  static defaultProps = {
    parameters: { type: "object", value: compositeBlendParameters },
  };

  initializeState(context: { device: Device }) {
    this.setState({
      model: new ClipSpace(context.device, {
        id: `${this.id}-clipspace`,
        fs: compositeFragmentShader,
      }),
    });
  }

  draw(params: Parameters<Layer["draw"]>[0]) {
    const texture = this.props.result?.texture;
    if (!texture) return;
    (this.state.model as ClipSpace).setBindings({ uFill: texture });
    // `parameters` must be explicit: `applyModelParameters` would otherwise
    // reset the ClipSpace model to deck's default blend.
    super.draw(params);
  }
}

/**
 * Renders only the overlay layers (by `id` prefix) into an offscreen FBO before the main
 * pass, handing the resulting texture to the composite layer. Runs every frame; a
 * preRender-only effect does not trigger deck's postprocess machinery.
 */
export class OverlayCompositeEffect implements Effect {
  id = "overlay-composite-effect";
  props = {};

  private readonly result: OverlayCompositeResult;
  private pass: _LayersPass | null = null;
  private framebuffer: Framebuffer | null = null;
  private texture: Texture | null = null;
  private size: [number, number] = [0, 0];

  constructor(result: OverlayCompositeResult) {
    this.result = result;
  }

  setup(context: EffectContext) {
    this.pass = new _LayersPass(context.device);
  }

  cleanup() {
    this.pass = null;
    this.releaseTarget();
    this.result.texture = undefined;
  }

  private releaseTarget() {
    this.framebuffer?.destroy();
    this.texture?.destroy();
    this.framebuffer = null;
    this.texture = null;
  }

  preRender(opts: LayersPassRenderOptions): void {
    const overlayLayers = opts.layers.filter((layer) => layer.id.startsWith(OVERLAYS_ID_PREFIX));

    if (overlayLayers.length === 0 || !this.pass) {
      this.result.texture = undefined;
      return;
    }

    const device = this.pass.device;
    const canvasContext = device.canvasContext;
    if (!canvasContext) {
      this.result.texture = undefined;
      return;
    }
    const [width, height] = canvasContext.getDrawingBufferSize();

    if (!this.texture || width !== this.size[0] || height !== this.size[1]) {
      this.releaseTarget();
      this.texture = device.createTexture({
        sampler: {
          minFilter: "linear",
          magFilter: "linear",
          addressModeU: "clamp-to-edge",
          addressModeV: "clamp-to-edge",
        },
        width,
        height,
      });
      // luma framebuffers do not derive their size from colorAttachments —
      // without explicit width/height they default to 1x1, and deck's
      // getGLViewport then computes a viewport shifted `height` px off-screen.
      this.framebuffer = device.createFramebuffer({
        id: "overlay-composite-fbo",
        width,
        height,
        colorAttachments: [this.texture],
      });
      this.size = [width, height];
    }

    this.pass.render({
      ...opts,
      target: this.framebuffer,
      layers: overlayLayers,
      effects: undefined,
      layerFilter: undefined,
      clearStack: true,
      clearCanvas: true,
      clearColor: [0, 0, 0, 0],
      isPicking: false,
    });

    this.result.texture = this.texture;
  }
}
