/** Measured rendering limits for the user's browser. */
export interface ExportRenderLimits {
  /** Largest square side a canvas can hold (probed, e.g. 16384 or 8192). */
  maxCanvasSide: number;
  /** Upper bound on total pixel count (area), derived from the side caps. */
  areaLimit: number;
}

/** Largest canvas side Chrome/Safari/Firefox commonly allow before toBlob fails. */
export const BROWSER_MAX_CANVAS_SIDE = 16384;

/** Total-pixel ceiling: 2^28 ≈ 268M px guards GPU memory + readback cost. */
export const BROWSER_AREA_LIMIT = 16384 * 16384;

export interface PixelDensityInput {
  /** Target width in device pixels — the preset's intended display width. */
  targetWidthPx: number;
  /** Target height in device pixels, following the framing's own aspect. */
  targetHeightPx: number;
  /** Limits measured at capture time; probed from the environment when omitted. */
  limits: ExportRenderLimits;
}

export interface PixelDensityResult {
  width: number;
  height: number;
  /** The requested size exceeded the measured limits and was shrunk. */
  clamped: boolean;
}

const floorEven = (value: number): number => {
  const floored = Math.floor(value);
  // Even dimensions keep PNG encoders and downstream tooling happy.
  return floored % 2 === 0 ? floored : floored - 1;
};

/**
 * Maps a resolution preset (DPI) against the framed extent's physical size to
 * the export's pixel dimensions, clamped to what the user's browser can
 * actually render: the probed canvas side cap and a total-area ceiling. The
 * result keeps the framed extent's aspect ratio while shrinking as little as
 * possible.
 */
export const pixelsForDensity = ({
  targetWidthPx,
  targetHeightPx,
  limits,
}: PixelDensityInput): PixelDensityResult => {
  const requestedWidth = targetWidthPx;
  const requestedHeight = targetHeightPx;

  const maxSide = Math.min(limits.maxCanvasSide, Math.sqrt(limits.areaLimit));

  let width = requestedWidth;
  let height = requestedHeight;

  const exceedsSide = width > maxSide || height > maxSide;
  const exceedsArea = width * height > limits.areaLimit;
  if (exceedsSide || exceedsArea) {
    const sideFactor = Math.min(maxSide / width, maxSide / height, 1);
    const areaFactor = Math.sqrt(limits.areaLimit / (width * height));
    const factor = Math.min(sideFactor, areaFactor);
    width *= factor;
    height *= factor;
  }

  const evenWidth = floorEven(width);
  const evenHeight = floorEven(height);
  return {
    width: evenWidth,
    height: evenHeight,
    clamped: evenWidth < requestedWidth || evenHeight < requestedHeight,
  };
};

/**
 * Caps an export at the image's native scan resolution (level-0 pixels): at
 * 1 export px = 1 level-0 px, more pixels add no information. A request up to
 * 2× beyond native is allowed but flagged `upscaled`; beyond that the size is
 * clamped to 2× native.
 */
export const capAtNativeResolution = (
  size: { width: number; height: number },
  framedLevel0Extent: { width: number; height: number },
): { width: number; height: number; upscaled: boolean } => {
  const nativeWidth = framedLevel0Extent.width;
  const nativeHeight = framedLevel0Extent.height;
  const maxUpscaleFactor = 2;

  const widthRatio = size.width / nativeWidth;
  const heightRatio = size.height / nativeHeight;

  // The framed extent's own aspect — the export is clamped against it, not the
  // whole slide, so a region export never inherits the full image's budget.
  const width = Math.min(size.width, nativeWidth * maxUpscaleFactor);
  const height = Math.min(size.height, nativeHeight * maxUpscaleFactor);

  const upscaled = widthRatio > 1 || heightRatio > 1;

  return {
    width: floorEven(width),
    height: floorEven(height),
    upscaled,
  };
};

/** Probes the browser's canvas side cap by allocating progressively larger canvases. */
export const probeMaxCanvasSide = (): number => {
  if (typeof document === "undefined") return BROWSER_MAX_CANVAS_SIDE;
  // Probe by allocating: a canvas that exceeds the browser cap reports a
  // clamped drawing-buffer size, so a successful round-trip proves usability.
  for (const side of [16384, 8192, 4096]) {
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    if (canvas.width === side && canvas.height === side) {
      const context = canvas.getContext("2d");
      if (context) return side;
    }
  }
  return 4096;
};

/** Builds a best-effort limits object without a live GL context. */
export const fallbackRenderLimits = (): ExportRenderLimits => ({
  maxCanvasSide: probeMaxCanvasSide(),
  areaLimit: BROWSER_AREA_LIMIT,
});
