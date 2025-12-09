// TODO: Don't just assume 16-bit data
export function getHistogram(data: number[], bitDepth = 16): number[] {
  const numBuckets = 256;
  const maxValue = 2 ** bitDepth;
  const binSize = maxValue / numBuckets;

  const histogram: number[] = new Array(numBuckets).fill(0);

  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    const bucketIndex = Math.floor(value / binSize);
    histogram[bucketIndex]++;
  }

  return histogram;
}
