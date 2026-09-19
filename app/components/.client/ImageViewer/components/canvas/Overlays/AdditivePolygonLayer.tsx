import { SolidPolygonLayer } from "@deck.gl/layers";

import { shadersInject, additiveBlendParameters } from "./additiveBlending.glsl";
import { type MarkerProps, type MarkerLayerProps, markerUniforms } from "./markerUniforms";

export class AdditivePolygonLayer extends SolidPolygonLayer<MarkerLayerProps> {
  static layerName = "AdditivePolygonLayer";

  static defaultProps = {
    parameters: additiveBlendParameters,
  };

  // SolidPolygonLayer renders polygons as objects, so each polygon gets the attribute value.
  initializeState() {
    super.initializeState();

    this.getAttributeManager()?.add({
      markerMask: {
        size: 1,
        accessor: "getMarkerMask",
      },
    });
  }

  getShaders(shaderType?: string) {
    const shaders = super.getShaders(shaderType);
    shaders.modules.push(markerUniforms);
    shaders.inject = shadersInject;
    return shaders;
  }

  draw(params: Parameters<SolidPolygonLayer["draw"]>[0]) {
    // @ts-expect-error - markerProps is a custom prop
    const markerProps = this.props.markerProps as MarkerProps | undefined;
    if (markerProps) {
      const models =
        (
          this.state as {
            models?: {
              shaderInputs: {
                setProps: (props: Record<string, unknown>) => void;
              };
            }[];
          }
        ).models || [];

      models.forEach((model) => {
        model.shaderInputs.setProps({ marker: markerProps });
      });
    }
    super.draw(params);
  }
}
