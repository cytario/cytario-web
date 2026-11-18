import { BlobTiffClient } from "../BlobTiffClient";

const bytes = (content: string): ArrayBuffer =>
  new TextEncoder().encode(content).buffer as ArrayBuffer;

describe("BlobTiffClient", () => {
  test("answers a range request by slicing the source", async () => {
    const source = new Blob([bytes("0123456789")]);
    const client = new BlobTiffClient("slide.ome.tif", source);

    const response = await client.request({ headers: { range: "bytes=2-5" } });

    expect(response.ok).toBe(true);
    expect(response.status).toBe(206);
    const data = new Uint8Array(await response.getData());
    expect(Array.from(data)).toEqual([50, 51, 52, 53]);
  });

  test("an open-ended range reads to the end of the source", async () => {
    const source = new Blob([bytes("0123456789")]);
    const client = new BlobTiffClient("slide.ome.tif", source);

    const response = await client.request({ headers: { range: "bytes=7-" } });

    const data = new Uint8Array(await response.getData());
    expect(Array.from(data)).toEqual([55, 56, 57]);
  });

  test("a request without a Range header reads the whole source", async () => {
    const source = new Blob([bytes("abc")]);
    const client = new BlobTiffClient("slide.ome.tif", source);

    const response = await client.request({});

    const data = new Uint8Array(await response.getData());
    expect(Array.from(data)).toEqual([97, 98, 99]);
  });

  test("rejects an aborted signal before reading", async () => {
    const source = new Blob([bytes("abc")]);
    const client = new BlobTiffClient("slide.ome.tif", source);
    const controller = new AbortController();
    controller.abort();

    await expect(client.request({ headers: {}, signal: controller.signal })).rejects.toThrow(
      /aborted/i,
    );
  });

  test("rejects a malformed Range header", async () => {
    const source = new Blob([bytes("abc")]);
    const client = new BlobTiffClient("slide.ome.tif", source);

    await expect(client.request({ headers: { range: "chunks=1-2" } })).rejects.toThrow(
      /unsupported Range/i,
    );
  });
});
