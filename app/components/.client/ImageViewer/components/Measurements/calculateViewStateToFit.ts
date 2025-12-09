import { Image } from "../../state/ome.tif.types";
import { ViewPort, ViewState } from "../../state/types";

interface CalculateViewStateOptions {
  padding: number;
}

export function calculateViewStateToFit(
  metadata: Image,
  viewport: ViewPort,
  options?: CalculateViewStateOptions
): ViewState {
  const { SizeX, SizeY, PhysicalSizeX, PhysicalSizeY } = metadata.Pixels;

  if (!PhysicalSizeX || !PhysicalSizeY) {
    throw new Error("Physical pixel size is missing from metadata.");
  }

  const padding = options?.padding ?? 0;

  // 1. Calculate physical dimensions in microns (µm).
  const physicalWidth = SizeX * PhysicalSizeX; // µm
  const physicalHeight = SizeY * PhysicalSizeY; // µm

  // 2. Adjust viewport dimensions for padding.
  const adjustedWidth = Math.max(viewport.width - 2 * padding, 1);
  const adjustedHeight = Math.max(viewport.height - 2 * padding, 1);

  // 3. Calculate aspect ratios.
  const imageAspectRatio = physicalWidth / physicalHeight;
  const viewportAspectRatio = adjustedWidth / adjustedHeight;

  // 4. Calculate scale factor to fit image with padding.
  const scale =
    imageAspectRatio > viewportAspectRatio
      ? adjustedWidth / SizeX // Fit by width
      : adjustedHeight / SizeY; // Fit by height

  // Viv uses a logarithmic zoom scale: zoom = log2(scale)
  const zoom = Math.log2(scale);

  // 5. Center the image (target is in absolute pixel coordinates).
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
