import { Image } from "../../../state/store/core/ome.tif.types";
import { ViewPort, ViewState } from "../../../state/store/types";

interface CalculateViewStateOptions {
  padding: number;
}

export function calculateViewStateToFit(
  metadata: Image,
  viewport: ViewPort,
  options?: CalculateViewStateOptions,
): ViewState {
  const { SizeX, SizeY, PhysicalSizeX, PhysicalSizeY } = metadata.Pixels;

  const padding = options?.padding ?? 0;

  // Physical extents when the metadata declares them; pixel dimensions otherwise.
  const fitWidthX = PhysicalSizeX || 1;
  const fitHeightY = PhysicalSizeY || 1;

  const adjustedWidth = Math.max(viewport.width - 2 * padding, 1);
  const adjustedHeight = Math.max(viewport.height - 2 * padding, 1);

  const imageAspectRatio = (SizeX * fitWidthX) / (SizeY * fitHeightY);
  const viewportAspectRatio = adjustedWidth / adjustedHeight;

  const scale =
    imageAspectRatio > viewportAspectRatio
      ? adjustedWidth / SizeX // fit by width
      : adjustedHeight / SizeY; // fit by height

  // Viv uses a logarithmic zoom scale: zoom = log2(scale)
  const zoom = Math.log2(scale);

  const target: [number, number] = [SizeX / 2, SizeY / 2];

  return {
    width: viewport.width,
    height: viewport.height,
    rotationX: 0,
    rotationOrbit: 0,
    target,
    zoom,
    minRotationX: -90,
    maxRotationX: 90,
    minZoom: -10,
    maxZoom: 10,
    transitionDuration: 0,
  };
}
