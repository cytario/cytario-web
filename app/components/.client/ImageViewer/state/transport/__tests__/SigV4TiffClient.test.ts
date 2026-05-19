import type { Credentials } from "@aws-sdk/client-sts";

import { SigV4TiffClient } from "../SigV4TiffClient";
import type { SignedFetch } from "~/utils/signedFetch";
import { createSignedFetch } from "~/utils/signedFetch";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const FAST_RETRY = { baseDelayMs: 0, maxDelayMs: 0 };

const credentials: Credentials = {
  AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  SessionToken: "FwoGZXIvYXdzEBYaDK",
  Expiration: new Date(),
};
const connectionConfig = { region: "us-west-2" };
const signedFetch = createSignedFetch(() => credentials, connectionConfig);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("SigV4TiffClient opts.headers forwarding (SDS-CY-010050)", () => {
  test("threads constructor-supplied extraHeaders into every range request", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
      headers: new Map([["content-length", "8"]]),
    });

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      { "If-None-Match": "etag-xyz" },
    );

    await client.request({ headers: { Range: "bytes=0-1023" } });

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers).toMatchObject({
      Range: "bytes=0-1023",
      "If-None-Match": "etag-xyz",
    });
  });

  test("per-request Range wins over a Range supplied via extraHeaders", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Map(),
    });

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      { Range: "bytes=0-0" },
    );

    await client.request({ headers: { Range: "bytes=1024-2047" } });

    const [, fetchOptions] = mockFetch.mock.calls[0];
    // Geotiff's per-tile Range must take precedence — extraHeaders are
    // for load-wide intent (Accept, If-None-Match, Cache-Control), not
    // for the per-fetch byte range.
    expect(fetchOptions.headers.Range).toBe("bytes=1024-2047");
  });

  test("no extraHeaders defaults to {} (no key bleed)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 206,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Map(),
    });

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
    );

    await client.request({ headers: { Range: "bytes=0-1023" } });

    const [, fetchOptions] = mockFetch.mock.calls[0];
    expect(fetchOptions.headers.Range).toBe("bytes=0-1023");
    expect(fetchOptions.headers["If-None-Match"]).toBeUndefined();
  });
});

describe("SigV4TiffClient retry on transient failures", () => {
  function makeResponse(status: number, ok = status >= 200 && status < 300) {
    return {
      ok,
      status,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      headers: new Map([["content-length", "0"]]),
    };
  }

  test("retries on 503 and succeeds on second attempt", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503, false))
      .mockResolvedValueOnce(makeResponse(206));

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      FAST_RETRY,
    );

    const result = await client.request({ headers: { Range: "bytes=0-1023" } });

    expect(result.status).toBe(206);
    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("retries on 429 then 500 and surfaces last response after maxAttempts", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(429, false))
      .mockResolvedValueOnce(makeResponse(500, false))
      .mockResolvedValueOnce(makeResponse(503, false));

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      { maxAttempts: 3, ...FAST_RETRY },
    );

    const result = await client.request({ headers: { Range: "bytes=0-1023" } });

    expect(result.status).toBe(503);
    expect(result.ok).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  test("does not retry on 4xx non-transient (403)", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(403, false));

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      FAST_RETRY,
    );

    const result = await client.request({ headers: { Range: "bytes=0-1023" } });

    expect(result.status).toBe(403);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("retries thrown network errors", async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(makeResponse(206));

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      FAST_RETRY,
    );

    const result = await client.request({ headers: { Range: "bytes=0-1023" } });

    expect(result.status).toBe(206);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("does not retry on AbortError", async () => {
    const abort = new DOMException("Aborted", "AbortError");
    mockFetch.mockRejectedValueOnce(abort);

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      FAST_RETRY,
    );

    await expect(client.request({ headers: { Range: "bytes=0-1023" } })).rejects.toBe(abort);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("throws AbortError immediately if signal already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      FAST_RETRY,
    );

    await expect(
      client.request({ headers: { Range: "bytes=0-1023" }, signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("rethrows last error after exhausting attempts", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    const client = new SigV4TiffClient(
      "https://bucket.s3.us-west-2.amazonaws.com/img.tif",
      signedFetch,
      undefined,
      { maxAttempts: 2, ...FAST_RETRY },
    );

    // signedFetch wraps the underlying TypeError as CorsLikelyError; what
    // matters here is that the final error after exhausting attempts is
    // surfaced rather than swallowed.
    await expect(client.request({ headers: { Range: "bytes=0-1023" } })).rejects.toMatchObject({
      name: "CorsLikelyError",
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("maxAttempts=1 disables retries", async () => {
    const fakeFetch = vi
      .fn<SignedFetch>()
      .mockResolvedValue(new Response(new ArrayBuffer(0), { status: 503 }));

    const client = new SigV4TiffClient("https://example/x", fakeFetch, undefined, {
      maxAttempts: 1,
      ...FAST_RETRY,
    });

    const result = await client.request({ headers: { Range: "bytes=0-1023" } });
    expect(result.status).toBe(503);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });
});
