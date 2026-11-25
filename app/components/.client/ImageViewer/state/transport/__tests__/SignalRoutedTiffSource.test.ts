import {
  SignalRoutedTiffSource,
  type TiffClient,
  type TiffSource,
} from "../SignalRoutedTiffSource";

const makeBlockedSource = (): TiffSource & { fetch: ReturnType<typeof vi.fn> } => ({
  fetch: vi.fn(async () => [new ArrayBuffer(4)]),
  fileSize: 1000,
});

const makeClient = (status = 206, byteLength = 10) => {
  const request = vi.fn<TiffClient["request"]>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    getData: async () => new ArrayBuffer(byteLength),
  }));
  return { request };
};

describe("SignalRoutedTiffSource", () => {
  test("reads without a signal go through the block cache", async () => {
    const blockedSource = makeBlockedSource();
    const client = makeClient();
    const source = new SignalRoutedTiffSource(blockedSource, client);

    await source.fetch([{ offset: 0, length: 1024 }]);

    expect(blockedSource.fetch).toHaveBeenCalledWith([{ offset: 0, length: 1024 }]);
    expect(client.request).not.toHaveBeenCalled();
  });

  test("tile reads request exactly their own byte range with their own signal", async () => {
    const blockedSource = makeBlockedSource();
    const client = makeClient(206, 10);
    const source = new SignalRoutedTiffSource(blockedSource, client);
    const controller = new AbortController();

    const [data] = await source.fetch([{ offset: 100, length: 10 }], controller.signal);

    expect(blockedSource.fetch).not.toHaveBeenCalled();
    expect(client.request).toHaveBeenCalledWith({
      headers: { Range: "bytes=100-109" },
      signal: controller.signal,
    });
    expect(data.byteLength).toBe(10);
  });

  test("trims a response longer than the requested slice", async () => {
    const client = makeClient(206, 11);
    const source = new SignalRoutedTiffSource(makeBlockedSource(), client);

    const [data] = await source.fetch([{ offset: 0, length: 10 }], new AbortController().signal);

    expect(data.byteLength).toBe(10);
  });

  test("rejects a response that is not a partial range", async () => {
    const source = new SignalRoutedTiffSource(makeBlockedSource(), makeClient(200));

    await expect(
      source.fetch([{ offset: 0, length: 10 }], new AbortController().signal),
    ).rejects.toThrow("status 200");
  });

  test("propagates the client's abort", async () => {
    const client = {
      request: vi.fn<TiffClient["request"]>(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    };
    const source = new SignalRoutedTiffSource(makeBlockedSource(), client);

    await expect(
      source.fetch([{ offset: 0, length: 10 }], new AbortController().signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  test("reports the block cache's file size", () => {
    const source = new SignalRoutedTiffSource(makeBlockedSource(), makeClient());

    expect(source.fileSize).toBe(1000);
  });
});
