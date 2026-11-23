import { SignalRoutedTiffSource } from "../../transport/SignalRoutedTiffSource";
import { loadOmeTiffWithCredentials } from "../loadOmeTiffWithCredentials";
import type { LoadOptions } from "@cytario/plugin-api";

const blockedSource = { fetch: vi.fn(async () => [new ArrayBuffer(4)]), fileSize: 100 };
const geotiff = {
  source: blockedSource as unknown,
  getImage: async () => ({ fileDirectory: {} }),
};
let sourceSeenByViv: unknown;

vi.mock("geotiff", () => ({
  fromCustomClient: vi.fn(async () => geotiff),
}));

vi.mock("@hms-dbmi/viv", () => ({
  loadOmeTiff: vi.fn(async (_url: string, { source }: { source: typeof geotiff }) => {
    sourceSeenByViv = source.source;
    return { data: [], metadata: { Pixels: { Type: "uint16", Channels: [] } } };
  }),
}));

describe("loadOmeTiffWithCredentials tile reads", () => {
  test("routes tile reads around geotiff's block cache to the signed client", async () => {
    const signedFetch = vi.fn(async () => new Response(new ArrayBuffer(10), { status: 206 }));
    signedFetch.mockResolvedValueOnce(new Response(null, { status: 404 }));

    await loadOmeTiffWithCredentials("s3://bucket/image.ome.tif", {
      signedFetch,
    } as unknown as LoadOptions);

    expect(sourceSeenByViv).toBeInstanceOf(SignalRoutedTiffSource);

    const controller = new AbortController();
    await (sourceSeenByViv as SignalRoutedTiffSource).fetch(
      [{ offset: 20, length: 10 }],
      controller.signal,
    );

    const [, init] = signedFetch.mock.calls.at(-1) as unknown as [string, RequestInit];
    expect(init.signal).toBe(controller.signal);
    expect((init.headers as Record<string, string>).Range).toBe("bytes=20-29");
    expect(blockedSource.fetch).not.toHaveBeenCalled();
  });
});
