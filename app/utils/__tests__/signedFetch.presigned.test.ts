import { beforeEach, describe, expect, test, vi } from "vitest";

import { createPresignedFetch, createDataFetch } from "~/utils/signedFetch";

// ─── Mocks ────────────────────────────────────────────────────────────

const globalFetch = globalThis.fetch;

function mockFetchOnce(responses: Response | Response[]) {
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const next = queue.shift() ?? queue[0];
    return next;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

beforeEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = globalFetch;
});

// ─── Tests ───────────────────────────────────────────────────────────

describe("createPresignedFetch (C-377)", () => {
  const CONNECTION_ID = "conn-1";
  const S3_URL = "https://s3.eu-central-1.amazonaws.com/bucket/key.tif";

  test("mints a presigned URL from /api/presign and fetches it", async () => {
    const presignedUrl = "https://s3.example/signed-url";
    const expiresAt = new Date(Date.now() + 900_000).toISOString();

    mockFetchOnce([
      jsonResponse({ presignedUrl, expiresAt }),
      textResponse("image-data", 200),
    ]);

    const signedFetch = createPresignedFetch(CONNECTION_ID);
    const response = await signedFetch(S3_URL);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("image-data");

    expect(fetch).toHaveBeenCalledTimes(2);
    const presignCall = vi.mocked(fetch).mock.calls[0];
    expect(presignCall[0]).toBe("/api/presign");
    const presignBody = JSON.parse(presignCall[1]?.body as string);
    expect(presignBody).toEqual({
      connectionId: CONNECTION_ID,
      url: S3_URL,
      method: "GET",
    });
  });

  test("caches the presigned URL for repeated reads (no re-mint)", async () => {
    const presignedUrl = "https://s3.example/signed-url";
    const expiresAt = new Date(Date.now() + 900_000).toISOString();

    // 1 presign + 2 data fetches (two calls to signedFetch, one presign call)
    mockFetchOnce([
      jsonResponse({ presignedUrl, expiresAt }),
      textResponse("data1", 200),
      textResponse("data2", 200),
    ]);

    const signedFetch = createPresignedFetch(CONNECTION_ID);
    await signedFetch(S3_URL);
    await signedFetch(S3_URL);

    // Only 3 fetches: 1 presign + 2 data
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test("re-mints on 403 'Request has expired'", async () => {
    const expiredUrl = "https://s3.example/expired";
    const freshUrl = "https://s3.example/fresh";
    const expiresAt = new Date(Date.now() + 900_000).toISOString();

    mockFetchOnce([
      jsonResponse({ presignedUrl: expiredUrl, expiresAt }),
      textResponse("Request has expired", 403),
      jsonResponse({ presignedUrl: freshUrl, expiresAt }),
      textResponse("data-after-refresh", 200),
    ]);

    const signedFetch = createPresignedFetch(CONNECTION_ID);
    const response = await signedFetch(S3_URL);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("data-after-refresh");
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test("throws when presign API returns an error", async () => {
    mockFetchOnce(jsonResponse({ error: "Connection not found" }, 404));

    const signedFetch = createPresignedFetch(CONNECTION_ID);
    await expect(signedFetch(S3_URL)).rejects.toThrow("Connection not found");
  });

  test("passes the method from init to the presign API", async () => {
    const presignedUrl = "https://s3.example/signed-put";
    const expiresAt = new Date(Date.now() + 900_000).toISOString();

    mockFetchOnce([
      jsonResponse({ presignedUrl, expiresAt }),
      textResponse("ok", 200),
    ]);

    const signedFetch = createPresignedFetch(CONNECTION_ID);
    await signedFetch(S3_URL, { method: "PUT" });

    const presignBody = JSON.parse(
      vi.mocked(fetch).mock.calls[0][1]?.body as string,
    );
    expect(presignBody.method).toBe("PUT");
  });

  test("does not re-mint when cache entry is still valid", async () => {
    const presignedUrl = "https://s3.example/cached";
    const expiresAt = new Date(Date.now() + 900_000).toISOString();

    mockFetchOnce([
      jsonResponse({ presignedUrl, expiresAt }),
      textResponse("a", 200),
      textResponse("b", 200),
      textResponse("c", 200),
    ]);

    const signedFetch = createPresignedFetch(CONNECTION_ID);
    await signedFetch(S3_URL);
    await signedFetch(S3_URL);
    await signedFetch(S3_URL);

    // 1 presign + 3 data = 4 total
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe("createDataFetch", () => {
  test("delegates to presigned mode when credentialMode is 'presigned'", async () => {
    const presignedUrl = "https://s3.example/signed";
    const expiresAt = new Date(Date.now() + 900_000).toISOString();

    mockFetchOnce([
      jsonResponse({ presignedUrl, expiresAt }),
      textResponse("data", 200),
    ]);

    const dataFetch = createDataFetch(
      () => null,
      "eu-central-1",
      "conn-1",
      "presigned",
    );
    const response = await dataFetch("https://s3.example/bucket/key");

    expect(response.status).toBe(200);
    // First fetch should be to /api/presign
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/presign");
  });
});
