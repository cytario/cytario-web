import type { SupportedDtype } from "@vivjs/types";

import { getContrastLimits } from "./getContrastLimits";
import { getDomain } from "./getDomain";
import { getDtypeBitDepth } from "./getDtypeMax";
import { getHistogram } from "./getHistogram";
import { Loader } from "../state/store/ome.tif.types";
import { ByteDomain, Selection } from "../state/store/types";

export async function getSelectionStats({
  loader,
  selection,
}: {
  loader: Loader;
  selection: Selection;
}): Promise<{
  domain: ByteDomain;
  contrastLimits: ByteDomain;
  histogram: number[];
}> {
  const data = loader[loader.length - 1];

  const raster = await data.getRaster({
    selection,
  });

  if (!raster) {
    throw new Error("No raster data found");
  }

  const pixels = raster.data;
  const sortedPixels = [...pixels].sort((a, b) => a - b);
  // dtype is structurally `string` in @cytario/plugin-api; one of the
  // canonical PixelType values is guaranteed at runtime.
  const histogram = getHistogram(
    sortedPixels,
    getDtypeBitDepth(data.dtype as SupportedDtype),
  );
  const domain = getDomain(sortedPixels);
  const contrastLimits = getContrastLimits(sortedPixels);

  return { domain, contrastLimits, histogram };
}
