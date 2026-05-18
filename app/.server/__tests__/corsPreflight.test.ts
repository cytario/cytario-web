import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  describeCorsFailure,
  describeCorsWarning,
  probeBucketCors,
  redactIpLiterals,
} from "../corsPreflight";

const CYTARIO_ORIGIN = "https://app.cytario.com";
const BUCKET_URL = "https://s3.eu-central-1.amazonaws.com/test-bucket";

describe("probeBucketCors", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("ok: returns { ok: true, warnings: [] } when ACAO is present and not wildcard", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": CYTARIO_ORIGIN },
      }),
    );

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.warnings).toEqual([]);
  });

  test("ok: accepts 204 preflight responses (MinIO style)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 204,
        headers: { "Access-Control-Allow-Origin": CYTARIO_ORIGIN },
      }),
    );

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(true);
  });

  test("issues an OPTIONS request with the cytario origin and the request method/headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": CYTARIO_ORIGIN },
      }),
    );

    await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BUCKET_URL);
    expect(init.method).toBe("OPTIONS");
    expect(init.headers.Origin).toBe(CYTARIO_ORIGIN);
    expect(init.headers["Access-Control-Request-Method"]).toBe("GET");
    expect(init.headers["Access-Control-Request-Headers"]).toContain("authorization");
    expect(init.headers["Access-Control-Request-Headers"]).toContain("x-amz-security-token");
    expect(init.redirect).toBe("error");
  });

  test("network: returns reason: 'network' when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("getaddrinfo ENOTFOUND"));

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
    expect(result.detail).toContain("ENOTFOUND");
  });

  test("missing_origin_header: returns reason when ACAO is absent", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_origin_header");
  });

  test("wildcard_origin: surfaces as a warning, not a failure", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "*" },
      }),
    );

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(["wildcard_origin"]);
  });

  test("wildcard_origin: matches whitespace-padded wildcard too", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": "  *  " },
      }),
    );

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(["wildcard_origin"]);
  });

  test("preflight_status: non-2xx response is reported with the status code", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("preflight_status");
    expect(result.detail).toContain("403");
  });

  test("host_not_allowed: refuses to fetch URLs outside the S3 allowlist", async () => {
    const result = await probeBucketCors(
      "https://169.254.169.254/latest/meta-data/",
      CYTARIO_ORIGIN,
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("host_not_allowed");
    // The probe must not have run any network call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("host_not_allowed: refuses to fetch an http:// URL", async () => {
    const result = await probeBucketCors("http://localhost:9000/my-bucket", CYTARIO_ORIGIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("host_not_allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("Access-Control-Request-Headers reflects the SigV4 signed-header list", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "Access-Control-Allow-Origin": CYTARIO_ORIGIN },
      }),
    );

    await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    const [, init] = fetchMock.mock.calls[0];
    const header = init.headers["Access-Control-Request-Headers"];
    expect(header).toContain("authorization");
    expect(header).toContain("x-amz-content-sha256");
    expect(header).toContain("x-amz-date");
    expect(header).toContain("x-amz-security-token");
  });

  test("network: error detail has IPv4 literals stripped", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED 169.254.169.254:443"));

    const result = await probeBucketCors(BUCKET_URL, CYTARIO_ORIGIN);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("network");
    expect(result.detail).not.toContain("169.254.169.254");
    expect(result.detail).toContain("[redacted]");
  });
});

describe("redactIpLiterals", () => {
  test("redacts IPv4 literals with optional ports", () => {
    expect(redactIpLiterals("connect ECONNREFUSED 10.0.0.5:443")).toBe(
      "connect ECONNREFUSED [redacted]",
    );
    expect(redactIpLiterals("dial 192.168.1.1")).toBe("dial [redacted]");
  });

  test("redacts IPv6 literals", () => {
    expect(redactIpLiterals("connect ECONNREFUSED 2001:db8::1")).not.toContain("2001:db8");
    expect(redactIpLiterals("got addr ::1")).not.toContain("::1");
  });

  test("leaves hostnames untouched", () => {
    expect(redactIpLiterals("getaddrinfo ENOTFOUND minio.example.com")).toBe(
      "getaddrinfo ENOTFOUND minio.example.com",
    );
  });
});

describe("describeCorsFailure", () => {
  test("network message names DNS / endpoint", () => {
    const msg = describeCorsFailure({ ok: false, reason: "network", warnings: [] }, CYTARIO_ORIGIN);
    expect(msg).toMatch(/Could not reach the bucket/i);
    expect(msg).toMatch(/DNS/i);
  });

  test("missing_origin_header message names cytario origin", () => {
    const msg = describeCorsFailure(
      { ok: false, reason: "missing_origin_header", warnings: [] },
      CYTARIO_ORIGIN,
    );
    expect(msg).toContain(CYTARIO_ORIGIN);
  });

  test("preflight_status message includes the upstream detail", () => {
    const msg = describeCorsFailure(
      {
        ok: false,
        reason: "preflight_status",
        warnings: [],
        detail: "Preflight returned HTTP 403",
      },
      CYTARIO_ORIGIN,
    );
    expect(msg).toContain("403");
  });
});

describe("describeCorsWarning", () => {
  test("wildcard_origin warning names cytario origin", () => {
    const msg = describeCorsWarning("wildcard_origin", CYTARIO_ORIGIN);
    expect(msg).toMatch(/\*/);
    expect(msg).toContain(CYTARIO_ORIGIN);
  });
});
