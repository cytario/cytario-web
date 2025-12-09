import { ByteDomain } from "../state/types";

export const getDomain = (sortedPixels: number[]): ByteDomain => {
  const domainMin = sortedPixels[0];
  const domainMax = sortedPixels[sortedPixels.length - 1];
  return [domainMin, domainMax];
};
