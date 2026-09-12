import { describe, expect, test, vi } from "vitest";

import { createSpatialDataStore } from "../createSpatialDataStore";
import type { SignedFetch } from "~/utils/signedFetch";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("createSpatialDataStore", () => {
  test("delegates key fetches to signedFetch with request headers", async () => {
    const signedFetch = vi.fn<SignedFetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const store = createSpatialDataStore("https://bucket.s3.amazonaws.com/data.zarr", signedFetch);

    const result = await store.get("/zarr.json");

    expect(signedFetch).toHaveBeenCalledTimes(1);
    const [url, init] = signedFetch.mock.calls[0];
    expect(url).toBe("https://bucket.s3.amazonaws.com/data.zarr/zarr.json");
    expect(init?.method).toBe("GET");
    expect((init?.headers as Record<string, string>).range).toBeUndefined();
    const resultBytes = new TextDecoder().decode(result ?? new Uint8Array());
    expect(JSON.parse(resultBytes)).toEqual({ ok: true });
  });

  test("remaps 403 to 404 so missing keys resolve to undefined", async () => {
    const signedFetch = vi.fn<SignedFetch>().mockResolvedValue(new Response(null, { status: 403 }));
    const store = createSpatialDataStore("https://bucket.s3.amazonaws.com/data.zarr", signedFetch);

    await expect(store.get("/.zattrs")).resolves.toBeUndefined();
  });

  test("maps a not-found key to undefined without calling signedFetch twice", async () => {
    const signedFetch = vi.fn<SignedFetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const store = createSpatialDataStore("https://bucket.s3.amazonaws.com/data.zarr", signedFetch);

    await expect(store.get("/zarr.json")).resolves.toBeUndefined();
    expect(signedFetch).toHaveBeenCalledTimes(1);
  });

  test("forwards range headers on getRange reads", async () => {
    const signedFetch = vi
      .fn<SignedFetch>()
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 206 }));
    const store = createSpatialDataStore("https://bucket.s3.amazonaws.com/data.zarr", signedFetch);

    const result = await store.getRange("/images/blobs_image/s0/0", { offset: 4, length: 3 });

    expect(signedFetch).toHaveBeenCalledTimes(1);
    const [, init] = signedFetch.mock.calls[0];
    expect((init?.headers as Record<string, string>).Range).toBe("bytes=4-6");
    expect(Array.from(result ?? [])).toEqual([1, 2, 3]);
  });

  test("propagates non-403/404 error statuses as thrown errors", async () => {
    const signedFetch = vi
      .fn<SignedFetch>()
      .mockResolvedValue(new Response("boom", { status: 500 }));
    const store = createSpatialDataStore("https://bucket.s3.amazonaws.com/data.zarr", signedFetch);

    await expect(store.get("/zarr.json")).rejects.toThrow(/status 500/i);
  });
});
