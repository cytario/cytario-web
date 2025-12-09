import { ScatterplotLayer } from "@deck.gl/layers";

import { shadersInject } from "./additiveBlending.glsl";
import {
  type MarkerProps,
  type MarkerLayerProps,
  markerUniforms,
} from "./markerUniforms";

export class AdditiveScatterplotLayer extends ScatterplotLayer<MarkerLayerProps> {
  static layerName = "AdditiveScatterplotLayer";

  initializeState() {
    super.initializeState();

    this.getAttributeManager()?.addInstanced({
      markerMask: {
        size: 1,
        accessor: "getMarkerMask",
      },
    });
  }

  getShaders() {
    const shaders = super.getShaders();
    shaders.modules.push(markerUniforms);
    shaders.inject = shadersInject;
    return shaders;
  }

  draw(params: Parameters<ScatterplotLayer["draw"]>[0]) {
    // @ts-expect-error - markerProps is a custom prop
    const markerProps = this.props.markerProps as MarkerProps | undefined;
    if (markerProps) {
      const model = this.state.model;
      if (model) {
        model.shaderInputs.setProps({ marker: markerProps });
      }
    }
    super.draw(params);
  }
}
