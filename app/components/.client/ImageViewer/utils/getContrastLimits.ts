import { ByteDomain } from "../state/types";

const lowerCutoff = 0.7;
const upperCutoff = 0.9999;

export const getContrastLimits = (sortedPixels: number[]): ByteDomain => {
  const idxMin = Math.floor(lowerCutoff * (sortedPixels.length - 1));
  const idxMax = Math.floor(upperCutoff * (sortedPixels.length - 1));
  const contrastMin = sortedPixels[idxMin];
  const contrastMax = sortedPixels[idxMax];
  return [contrastMin, contrastMax];
};
