/* eslint-disable @typescript-eslint/no-explicit-any */

export const handleImageViewerHover = ({ tile, coordinate, sourceLayer: layer }: any) => {
  let hoverData;
  if (layer.id.includes("Tiled")) {
    if (!tile?.content) {
      return null;
    }
    const {
      content,
      bbox,
      index: { z },
    } = tile;
    if (!content.data || !bbox) {
      return null;
    }
    const { data, width, height } = content;
    const { left, right, top, bottom } = bbox;
    const bounds = [
      left,
      data.height < layer.tileSize ? height : bottom,
      data.width < layer.tileSize ? width : right,
      top,
    ];
    if (!data) {
      return null;
    }
    const layerZoomScale = Math.max(1, 2 ** Math.round(-z));
    const dataCoords = [
      Math.floor((coordinate[0] - bounds[0]) / layerZoomScale),
      Math.floor((coordinate[1] - bounds[3]) / layerZoomScale),
    ];
    const coords = dataCoords[1] * width + dataCoords[0];
    hoverData = data.map((d: any) => d[coords]);
  } else {
    const { channelData } = layer.props;
    if (!channelData) {
      return null;
    }
    const { data, width, height } = channelData;
    if (!data || !width || !height) {
      return null;
    }
    const bounds = [0, height, width, 0];
    // Floor so that as we zoom out, we scale by the zoom just passed, not the one coming.
    const { zoom } = layer.context.viewport;
    const layerZoomScale = Math.max(1, 2 ** Math.floor(-zoom));
    const dataCoords = [
      Math.floor((coordinate[0] - bounds[0]) / layerZoomScale),
      Math.floor((coordinate[1] - bounds[3]) / layerZoomScale),
    ];
    const coords = dataCoords[1] * width + dataCoords[0];
    hoverData = data.map((d: any) => d[coords]);
  }
  return { hoverData, coordinate };
};
