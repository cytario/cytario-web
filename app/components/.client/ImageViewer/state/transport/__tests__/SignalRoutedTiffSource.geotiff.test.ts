import { fromCustomClient, writeArrayBuffer } from "geotiff";

import { SignalRoutedTiffSource } from "../SignalRoutedTiffSource";

// geotiff's writer emits 8-bit samples in a single strip.
const pixels = Array.from({ length: 64 * 64 }, (_, index) => index % 251);
const file = writeArrayBuffer(pixels, { width: 64, height: 64 }) as ArrayBuffer;

interface LoggedRequest {
  range: string;
  signal?: AbortSignal;
}

const makeClient = (log: LoggedRequest[], delayMs = 0) => ({
  url: "memory://image.tif",
  async request({ headers, signal }: { headers?: Record<string, string>; signal?: AbortSignal }) {
    const range = headers!.Range;
    log.push({ range, signal });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const [, startText, endText] = /bytes=(\d+)-(\d+)/.exec(range)!;
    const start = Number(startText);
    const end = Math.min(Number(endText), file.byteLength - 1);
    return {
      ok: true,
      status: 206,
      getHeader: (name: string) =>
        name.toLowerCase() === "content-range" ? `bytes ${start}-${end}/${file.byteLength}` : "",
      getData: async () => file.slice(start, end + 1),
    };
  },
});

const openRouted = async (log: LoggedRequest[], delayMs = 0) => {
  const client = makeClient(log, delayMs);
  const tiff = await fromCustomClient(client as never, { cacheSize: Number.POSITIVE_INFINITY });
  tiff.source = new SignalRoutedTiffSource(tiff.source, client);
  return tiff.getImage(0);
};

describe("SignalRoutedTiffSource with geotiff", () => {
  test("metadata reads use the block cache and pixel reads request their exact range", async () => {
    const log: LoggedRequest[] = [];
    const image = await openRouted(log);
    const metadataRequestCount = log.length;
    const controller = new AbortController();

    const rasters = await image.readRasters({ signal: controller.signal });

    expect(log.slice(0, metadataRequestCount).every(({ signal }) => !signal)).toBe(true);
    expect(log.slice(metadataRequestCount)).toEqual([
      { range: "bytes=1000-5095", signal: controller.signal },
    ]);
    expect(Array.from(rasters[0] as Uint8Array)).toEqual(pixels);
  });

  test("aborting one read leaves a concurrent read of the same bytes intact", async () => {
    const image = await openRouted([], 20);
    const abandoned = new AbortController();
    const kept = new AbortController();

    const abandonedRead = image.readRasters({ signal: abandoned.signal, window: [0, 0, 64, 32] });
    const keptRead = image.readRasters({ signal: kept.signal, window: [0, 32, 64, 64] });
    abandoned.abort();

    await expect(abandonedRead).rejects.toMatchObject({ name: "AbortError" });
    const rasters = await keptRead;
    expect(Array.from(rasters[0] as Uint8Array)).toEqual(pixels.slice(32 * 64));
  });
});
