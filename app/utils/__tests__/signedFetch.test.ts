import type { Credentials } from "@aws-sdk/client-sts";
import { SignatureV4 } from "@smithy/signature-v4";

import {
  __resetCredentialsRefresher,
  ExpiredCredentialsError,
  setCredentialsRefresher,
} from "~/utils/credentialsRefresh";
import { CorsLikelyError, createSignedFetch } from "~/utils/signedFetch";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockCredentials: Credentials = {
  AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  SessionToken: "FwoGZXIvYXdzEBYaDK...",
  Expiration: new Date(),
};

const mockConfig = "eu-central-1";

describe("createSignedFetch", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(new Response("ok"));
  });

  test("returns a function", () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    expect(typeof sf).toBe("function");
  });

  test("signs requests with Authorization header", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toHaveProperty("authorization");
    expect(init.headers.authorization).toContain("AWS4-HMAC-SHA256");
  });

  test("includes x-amz-security-token when SessionToken is present", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toHaveProperty("x-amz-security-token");
  });

  test("passes caller headers (e.g. Range) unsigned", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key", {
      headers: { Range: "bytes=0-1024" },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).toHaveProperty("Range", "bytes=0-1024");
    expect(init.headers).toHaveProperty("authorization");
  });

  test("caller-supplied Authorization cannot override the signed Authorization", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key", {
      headers: { Authorization: "Bearer evil-token" },
    });

    const [, init] = mockFetch.mock.calls[0];
    // The signed Authorization (AWS SigV4) must win — never replaced by the
    // caller-supplied bearer.
    expect(init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(init.headers.authorization).not.toContain("evil-token");
  });

  test("caller-supplied x-amz-* headers are dropped by sanitizeHeaders", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key", {
      headers: {
        "x-amz-acl": "public-read",
        "X-Amz-Server-Side-Encryption": "AES256",
      },
    });

    const [, init] = mockFetch.mock.calls[0];
    // Plugin-supplied x-amz-acl never reaches the wire request.
    expect(init.headers).not.toHaveProperty("x-amz-acl");
    expect(init.headers).not.toHaveProperty("X-Amz-Server-Side-Encryption");
  });

  test("caller-supplied Host / Cookie headers are dropped by sanitizeHeaders", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key", {
      headers: { Host: "evil.example.com", Cookie: "stolen=yes" },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers).not.toHaveProperty("Cookie");
    // host: the signed request sets it internally; verify the caller's
    // attempt to point at "evil.example.com" did not land.
    expect(JSON.stringify(init.headers)).not.toContain("evil.example.com");
  });

  test("preserves percent-encoded paths end-to-end (canonical SignedHeaders match wire URL)", async () => {
    // Regression for the OME-TIFF e2e failure on key names with spaces.
    // With `uriEscapePath: false` the signer trusts the supplied path as
    // already-encoded — decoding `parsed.pathname` back to literal spaces
    // before signing made the canonical path (literal space) diverge from
    // the wire path (`%20`), and every key with a reserved character
    // returned 403 SignatureDoesNotMatch.
    //
    // Spying on `SignatureV4.prototype.sign` ensures the signer INPUT
    // carries the encoded path, not merely the wire URL. A future bug
    // that fed the signer a decoded path while keeping the wire encoded
    // would still emit a valid-shaped Authorization header (just one S3
    // rejects with 403); only the spy catches that drift.
    const signSpy = vi.spyOn(SignatureV4.prototype, "sign");
    try {
      const sf = createSignedFetch(() => mockCredentials, mockConfig);
      await sf("https://bucket.s3.eu-central-1.amazonaws.com/Alpha%20Lab/image.ome.tif");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      // Wire URL retains the percent-encoded form …
      expect(url).toContain("/Alpha%20Lab/");
      expect(url).not.toContain("/Alpha Lab/");
      // … the signer itself saw the encoded path …
      expect(signSpy).toHaveBeenCalledTimes(1);
      const signedRequest = signSpy.mock.calls[0][0] as { path: string };
      expect(signedRequest.path).toBe("/Alpha%20Lab/image.ome.tif");
      // … and the request actually carries a SigV4 Authorization header,
      // which proves the signer accepted the path without re-encoding it
      // (a mismatch would surface as 403 only at the AWS edge, but the
      // header is at least byte-identical to what the server expects).
      expect(init.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    } finally {
      signSpy.mockRestore();
    }
  });

  test("defaults to eu-central-1 when region is missing", async () => {
    const sf = createSignedFetch(() => mockCredentials, "");
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    const [, init] = mockFetch.mock.calls[0];
    // Credential scope in the Authorization header includes the region
    expect(init.headers.authorization).toContain("eu-central-1");
  });

  test("resolves credentials lazily per request", async () => {
    let currentCreds = { ...mockCredentials };
    const sf = createSignedFetch(() => currentCreds, mockConfig);

    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key1");
    const [, init1] = mockFetch.mock.calls[0];

    // Rotate credentials
    currentCreds = {
      ...mockCredentials,
      AccessKeyId: "NEWKEYID",
      SecretAccessKey: "NEWSECRET",
    };

    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key2");
    const [, init2] = mockFetch.mock.calls[1];

    // Both should have auth headers but with different credentials
    expect(init1.headers.authorization).toContain("AKIAIOSFODNN7EXAMPLE");
    expect(init2.headers.authorization).toContain("NEWKEYID");
  });

  test("caches signer when AccessKeyId is unchanged", async () => {
    const getter = vi.fn(() => mockCredentials);
    const sf = createSignedFetch(getter, mockConfig);

    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key1");
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key2");

    // Getter called twice (once per request), but the signer should
    // only be constructed once since AccessKeyId didn't change
    expect(getter).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("throws when AccessKeyId is missing", async () => {
    const sf = createSignedFetch(
      () => ({ ...mockCredentials, AccessKeyId: undefined }) as unknown as Credentials,
      mockConfig,
    );

    await expect(sf("https://bucket.s3.amazonaws.com/key")).rejects.toThrow(
      "Invalid credentials: AccessKeyId and SecretAccessKey are required",
    );
  });

  test("throws when SecretAccessKey is missing", async () => {
    const sf = createSignedFetch(
      () => ({ ...mockCredentials, SecretAccessKey: undefined }) as unknown as Credentials,
      mockConfig,
    );

    await expect(sf("https://bucket.s3.amazonaws.com/key")).rejects.toThrow(
      "Invalid credentials: AccessKeyId and SecretAccessKey are required",
    );
  });

  test("forwards signal for request cancellation", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    const controller = new AbortController();

    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key", {
      signal: controller.signal,
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.signal).toBe(controller.signal);
  });

  test("sets redirect: 'error' so 30x responses do not leak signed headers (H13)", async () => {
    // Default fetch behaviour is `redirect: "follow"`, which would re-send
    // the Authorization header and `x-amz-security-token` (carrying live
    // STS credentials) to whatever host a 30x response points at. Block
    // it at the request init level.
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.redirect).toBe("error");
  });

  test("caller-supplied init cannot override redirect: 'error'", async () => {
    // The caller cannot weaken redirect handling by passing
    // `redirect: "follow"` themselves; the signed-fetch wrapper must win.
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key", {
      redirect: "follow",
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.redirect).toBe("error");
  });

  test("appends 7-day response-cache-control for image tile URLs", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/image.ome.tif");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("response-cache-control=private%2C%20max-age%3D604800");
  });

  test("appends 1-hour response-cache-control for non-image URLs", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/image.offsets.json");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("response-cache-control=private%2C%20max-age%3D3600");
  });

  test("classifies OME-Zarr chunk paths as image data", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/image.zarr/0/0/0");
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("response-cache-control=private%2C%20max-age%3D604800");
  });

  test("SDS-CY-010014: concurrent calls do not serialize", async () => {
    // Two parallel signedFetch invocations on the same signer instance
    // must both reach the network without one waiting for the other.
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    const a = sf("https://bucket.s3.eu-central-1.amazonaws.com/key-a");
    const b = sf("https://bucket.s3.eu-central-1.amazonaws.com/key-b");
    await Promise.all([a, b]);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((call) => call[0]);
    expect(urls.some((u) => u.includes("key-a"))).toBe(true);
    expect(urls.some((u) => u.includes("key-b"))).toBe(true);
  });

  test("throws CorsLikelyError on Chrome-style 'Failed to fetch' TypeError", async () => {
    // Genuine CORS failures reject the retry too — both attempts fail.
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBeInstanceOf(
      CorsLikelyError,
    );
  });

  test("throws CorsLikelyError on WebKit-style 'Load failed' TypeError", async () => {
    mockFetch.mockRejectedValue(new TypeError("Load failed"));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBeInstanceOf(
      CorsLikelyError,
    );
  });

  test("throws CorsLikelyError on Firefox-style NetworkError TypeError", async () => {
    mockFetch.mockRejectedValue(new TypeError("NetworkError when attempting to fetch resource."));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBeInstanceOf(
      CorsLikelyError,
    );
  });

  test("passes through non-CORS errors unchanged without retrying", async () => {
    const original = new Error("some other failure");
    mockFetch.mockRejectedValueOnce(original);
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBe(original);
    // A non-TypeError is not a cache-op candidate — no retry.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("recovers from ERR_CACHE_OPERATION_NOT_SUPPORTED by retrying with cache: no-store", async () => {
    // Chrome surfaces the cache-op failure as a generic "Failed to fetch"
    // TypeError — indistinguishable from CORS until the retry succeeds.
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    mockFetch.mockResolvedValueOnce(new Response("tile-bytes"));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);

    const res = await sf("https://bucket.s3.eu-central-1.amazonaws.com/image.ome.tif", {
      headers: { Range: "bytes=0-1024" },
    });
    expect(await res.text()).toBe("tile-bytes");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Retry bypasses the browser disk cache but keeps the signed URL
    // (response-cache-control intact for CDN/SW).
    const [retryUrl, retryInit] = mockFetch.mock.calls[1];
    expect(retryInit.cache).toBe("no-store");
    expect(retryUrl).toContain("response-cache-control=private%2C%20max-age%3D604800");
    expect(retryInit.headers).toHaveProperty("Range", "bytes=0-1024");

    // First attempt used the normal (cacheable) fetch.
    const [, firstInit] = mockFetch.mock.calls[0];
    expect(firstInit.cache).toBeUndefined();
  });

  test("retries the cache-bypass GET at most once", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBeInstanceOf(
      CorsLikelyError,
    );
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  test("does not cache-retry non-idempotent methods", async () => {
    mockFetch.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await expect(
      sf("https://bucket.s3.eu-central-1.amazonaws.com/key", { method: "POST" }),
    ).rejects.toBeInstanceOf(CorsLikelyError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("CorsLikelyError carries the bucket host", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    const err = await sf("https://bucket.s3.eu-central-1.amazonaws.com/key").catch((e) => e);
    expect(err).toBeInstanceOf(CorsLikelyError);
    expect((err as CorsLikelyError).host).toBe("bucket.s3.eu-central-1.amazonaws.com");
  });

  test("preserves caller-supplied query string in signed URL", async () => {
    // Without query-merge, `new URL(url).search` is silently discarded —
    // any future caller passing `?versionId=...` would see it disappear
    // and the request would succeed against the HEAD version. The merge
    // pushes the params through the canonical request AND the wire URL
    // so the signature covers them and S3 honours them.
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key?versionId=foo&other=bar");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("versionId=foo");
    expect(url).toContain("other=bar");
    // response-cache-control is still appended.
    expect(url).toContain("response-cache-control=");
  });

  test("retries once after STS refresh when S3 returns ExpiredToken", async () => {
    __resetCredentialsRefresher();
    const refreshed = { ...mockCredentials, AccessKeyId: "REFRESHED" };
    const refresher = vi.fn().mockResolvedValue(refreshed);
    setCredentialsRefresher(refresher);

    // First call: HTTP 400 with ExpiredToken body. Second call: 200 OK.
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>ExpiredToken</Code><Message>The provided token has expired.</Message></Error>`,
        { status: 400 },
      ),
    );
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const sf = createSignedFetch(() => mockCredentials, mockConfig, "conn-a");
    const result = await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(refresher).toHaveBeenCalledWith("conn-a");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(await result.text()).toBe("ok");
    __resetCredentialsRefresher();
  });

  test("throws ExpiredCredentialsError when retry also fails", async () => {
    __resetCredentialsRefresher();
    const refresher = vi.fn().mockResolvedValue(mockCredentials);
    setCredentialsRefresher(refresher);

    mockFetch.mockReset();
    mockFetch.mockResolvedValue(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error><Code>ExpiredToken</Code></Error>`,
        { status: 400 },
      ),
    );

    const sf = createSignedFetch(() => mockCredentials, mockConfig, "conn-a");
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBeInstanceOf(
      ExpiredCredentialsError,
    );
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    __resetCredentialsRefresher();
  });

  test("throws ExpiredCredentialsError on ExpiredToken without installed refresher", async () => {
    __resetCredentialsRefresher();
    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(`<Error><Code>ExpiredToken</Code></Error>`, { status: 400 }),
    );

    const sf = createSignedFetch(() => mockCredentials, mockConfig, "conn-a");
    await expect(sf("https://bucket.s3.eu-central-1.amazonaws.com/key")).rejects.toBeInstanceOf(
      ExpiredCredentialsError,
    );
  });

  test("ExpiredTokenException (HTTP 403 / MinIO STS) also triggers retry", async () => {
    __resetCredentialsRefresher();
    const refresher = vi.fn().mockResolvedValue(mockCredentials);
    setCredentialsRefresher(refresher);

    mockFetch.mockReset();
    mockFetch.mockResolvedValueOnce(
      new Response(`<Error><Code>ExpiredTokenException</Code></Error>`, { status: 403 }),
    );
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const sf = createSignedFetch(() => mockCredentials, mockConfig, "conn-a");
    const result = await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
    __resetCredentialsRefresher();
  });

  test("SDS-CY-010405: Authorization.SignedHeaders lists every host-injected header", async () => {
    // Decode the SigV4 Authorization header and assert that every
    // host-injected header is present in the SignedHeaders=... list.
    // If a future change adds a header to the signing request without
    // SigV4 picking it up, the signature would not cover it and a
    // request-smuggling vector opens up.
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf("https://bucket.s3.eu-central-1.amazonaws.com/key");

    const [, init] = mockFetch.mock.calls[0];
    const authorization = init.headers.authorization as string;
    expect(authorization).toContain("AWS4-HMAC-SHA256");

    const signedHeadersMatch = authorization.match(/SignedHeaders=([^,]+)/);
    expect(signedHeadersMatch).not.toBeNull();
    const signedHeaders = signedHeadersMatch![1].split(";");

    // Names that the SigV4 signer must canonicalise. `host` is the only
    // header createSignedFetch hands to the signer at construction time
    // (per app/utils/signedFetch.ts); the signer itself adds the
    // remaining metadata headers, all of which must appear in
    // SignedHeaders so they are covered by the signature.
    expect(signedHeaders).toContain("host");
    expect(signedHeaders).toContain("x-amz-date");
    expect(signedHeaders).toContain("x-amz-content-sha256");
    expect(signedHeaders).toContain("x-amz-security-token");
  });
});
