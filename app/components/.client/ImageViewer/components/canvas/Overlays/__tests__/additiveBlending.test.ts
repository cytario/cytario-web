import { additiveBlendParameters } from "../additiveBlending.glsl";
import { AdditivePolygonLayer } from "../AdditivePolygonLayer";
import { AdditiveScatterplotLayer } from "../AdditiveScatterplotLayer";

describe("additiveBlendParameters", () => {
  test("accumulates source color onto the framebuffer (src-alpha, one)", () => {
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

  test("fill layers carry the additive blend state through layer props", () => {
    const polygon = new AdditivePolygonLayer({ id: "fill" });
    const scatterplot = new AdditiveScatterplotLayer({ id: "points" });

    expect(polygon.props.parameters).toEqual(additiveBlendParameters);
    expect(scatterplot.props.parameters).toEqual(additiveBlendParameters);
  });

  test("base layer defaults survive the subclass merge", () => {
    const polygon = new AdditivePolygonLayer({ id: "fill" });
    expect(polygon.props.visible).toBe(true);
  });
});
