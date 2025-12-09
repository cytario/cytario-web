import { getContrastLimits } from "./getContrastLimits";
import { getDomain } from "./getDomain";
import { getHistogram } from "./getHistogram";
import { Loader } from "../state/ome.tif.types";
import { ByteDomain, Selection } from "../state/types";

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
  const histogram = getHistogram(sortedPixels);
  const domain = getDomain(sortedPixels);
  const contrastLimits = getContrastLimits(sortedPixels);

  return { domain, contrastLimits, histogram };
}
