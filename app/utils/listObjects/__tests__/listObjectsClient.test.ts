import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  __resetCredentialsRefresher,
  ExpiredCredentialsError,
  setCredentialsRefresher,
} from "../../credentialsRefresh";
import { CorsLikelyError } from "../../signedFetch";
import { listObjectsClient } from "../listObjectsClient";
import mock from "~/utils/__tests__/__mocks__";

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${body}</ListBucketResult>`;

const contentsXml = (keys: string[]) =>
  keys
    .map(
      (k) =>
        `<Contents><Key>${k}</Key><LastModified>2026-01-01T00:00:00.000Z</LastModified><Size>100</Size><ETag>"x"</ETag></Contents>`,
    )
    .join("");

const commonPrefixesXml = (prefixes: string[]) =>
  prefixes.map((p) => `<CommonPrefixes><Prefix>${p}</Prefix></CommonPrefixes>`).join("");

describe("listObjectsClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("default mode sends Delimiter=/ and parses Contents + CommonPrefixes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>false</IsTruncated>${contentsXml(["file1.tif", "file2.tif"])}${commonPrefixesXml(["sub1/", "sub2/"])}`,
        ),
        { status: 200 },
      ),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {
      prefix: "",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/delimiter=%2F/);
    expect(url).toMatch(/list-type=2/);
    expect(result.contents.map((o) => o.Key)).toEqual(["file1.tif", "file2.tif"]);
    expect(result.commonPrefixes).toEqual(["sub1/", "sub2/"]);
    expect(result.isCapped).toBe(false);
  });

  test("recursive mode omits Delimiter", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>${contentsXml(["a/b/c.tif"])}`), {
        status: 200,
      }),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {
      recursive: true,
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toMatch(/delimiter/);
    expect(result.contents.map((o) => o.Key)).toEqual(["a/b/c.tif"]);
  });

  test("paginates while IsTruncated and threads continuation token", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>true</IsTruncated><NextContinuationToken>tok1</NextContinuationToken>${contentsXml(["a.tif"])}`,
        ),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>${contentsXml(["b.tif"])}`), {
        status: 200,
      }),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as string;
    expect(secondUrl).toMatch(/continuation-token=tok1/);
    expect(result.contents.map((o) => o.Key)).toEqual(["a.tif", "b.tif"]);
    expect(result.isCapped).toBe(false);
  });

  test("isCapped=true when maxTotal reached before S3 finishes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>true</IsTruncated><NextContinuationToken>more</NextContinuationToken>${contentsXml(["a.tif", "b.tif", "c.tif"])}`,
        ),
        { status: 200 },
      ),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {
      maxTotal: 3,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.contents).toHaveLength(3);
    expect(result.isCapped).toBe(true);
  });

  test("first-page network rejection rethrows", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));

    await expect(
      listObjectsClient(mock.connectionConfig(), mock.credentials(), {}),
    ).rejects.toThrow("network");
  });

  test("mid-pagination network rejection returns partial + isCapped=true", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>true</IsTruncated><NextContinuationToken>p2</NextContinuationToken>${contentsXml(["a.tif"])}`,
        ),
        { status: 200 },
      ),
    );
    fetchMock.mockRejectedValueOnce(new Error("network"));

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {});

    expect(result.contents.map((o) => o.Key)).toEqual(["a.tif"]);
    expect(result.isCapped).toBe(true);
  });

  test("first-page HTTP error throws", async () => {
    fetchMock.mockResolvedValueOnce(new Response("AccessDenied", { status: 403 }));

    await expect(
      listObjectsClient(mock.connectionConfig(), mock.credentials(), {}),
    ).rejects.toThrow(/403/);
  });

  test("findFirst short-circuits pagination on first match", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>true</IsTruncated><NextContinuationToken>more</NextContinuationToken>${contentsXml(["preview.tif", "other.tif"])}`,
        ),
        { status: 200 },
      ),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {
      findFirst: (obj) => obj.Key === "preview.tif",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.contents.map((o) => o.Key)).toContain("preview.tif");
  });

  test("AWS endpoint uses regional path-style URL", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>`), { status: 200 }),
    );

    await listObjectsClient(
      {
        name: "b-conn",
        bucketName: "b",
        endpoint: "https://s3.amazonaws.com",
        region: "eu-central-1",
      },
      mock.credentials(),
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith("https://s3.eu-central-1.amazonaws.com/b?")).toBe(true);
  });

  test("non-AWS endpoint uses endpoint host as-is (path-style)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>`), { status: 200 }),
    );

    await listObjectsClient(
      {
        name: "minio-conn",
        bucketName: "minio-bucket",
        endpoint: "http://localhost:9000",
        region: "eu-central-1",
      },
      mock.credentials(),
    );

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url.startsWith("http://localhost:9000/minio-bucket?")).toBe(true);
  });

  test("signed request carries Authorization header", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>`), { status: 200 }),
    );

    await listObjectsClient(mock.connectionConfig(), mock.credentials(), { prefix: "x/" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256/);
  });

  test("applies query filter on returned contents", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(`<IsTruncated>false</IsTruncated>${contentsXml(["needle.tif", "haystack.tif"])}`),
        { status: 200 },
      ),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {
      query: "needle",
    });

    expect(result.contents.map((o) => o.Key)).toEqual(["needle.tif"]);
  });

  test("encodes wire query with RFC-3986 strict (matches SigV4 canonical form)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>`), { status: 200 }),
    );

    // A prefix containing every character class that `URLSearchParams`
    // form-encodes differently from SigV4's canonical query encoder.
    await listObjectsClient(mock.connectionConfig(), mock.credentials(), {
      prefix: "a b+c/d=e!f*g'h(i)",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    const queryString = url.split("?")[1];

    // Spaces must be `%20`, never `+` (the form-encoding default).
    expect(queryString).not.toMatch(/\+(?!2B)/);
    expect(queryString).toContain("a%20b");
    // `+` must be `%2B`.
    expect(queryString).toContain("%2Bc");
    // `/` and `=` are reserved sub-delimiters and must be percent-encoded
    // inside a value.
    expect(queryString).toContain("%2Fd");
    expect(queryString).toContain("%3De");
    // `! * ' ( )` are unreserved-but-still-encoded by SigV4.
    expect(queryString).toContain("%21f");
    expect(queryString).toContain("%2Ag");
    expect(queryString).toContain("%27h");
    expect(queryString).toContain("%28i");
    expect(queryString).toContain("%29");
  });

  test("pagination with `+`-containing continuation token produces a signed request without form-encoding drift", async () => {
    // Real-world reproducer: base64 continuation tokens routinely contain
    // `+` and `/`. Under the old `URLSearchParams.toString()` encoder the
    // `+` stayed literal on the wire but became `%2B` in the canonical
    // request, breaking SigV4 on page 2.
    const continuationToken = "abc+def/ghi=";

    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>true</IsTruncated><NextContinuationToken>${continuationToken}</NextContinuationToken>${contentsXml(["a.tif"])}`,
        ),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>${contentsXml(["b.tif"])}`), {
        status: 200,
      }),
    );

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = fetchMock.mock.calls[1][0] as string;

    // Critical: `+` in the token must be `%2B` on the wire (matches
    // canonical), and `/` must be `%2F`, `=` must be `%3D`.
    expect(secondUrl).toContain("continuation-token=abc%2Bdef%2Fghi%3D");
    // No literal `+` (other than as part of `%2B`) and no literal `=`
    // inside the encoded value.
    expect(secondUrl).not.toMatch(/continuation-token=abc\+/);
    expect(secondUrl).not.toMatch(/continuation-token=abc%2Bdef\//);

    // Second request must carry a fresh Authorization header signed over
    // the same canonical query — without `uriEscapePath: false` and the
    // RFC-3986 wire encoder, the signature would have mismatched.
    const init = fetchMock.mock.calls[1][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256/);

    expect(result.contents.map((o) => o.Key)).toEqual(["a.tif", "b.tif"]);
  });

  test("mid-pagination XML parse failure returns partial contents with isCapped=true", async () => {
    // Page 1 succeeds with a valid IsTruncated=true response carrying a
    // continuation token; page 2 returns malformed XML. The caller must
    // keep page 1's contents and surface `isCapped: true` rather than
    // throwing and losing every page already collected.
    fetchMock.mockResolvedValueOnce(
      new Response(
        xml(
          `<IsTruncated>true</IsTruncated><NextContinuationToken>p2</NextContinuationToken>${contentsXml(["a.tif"])}`,
        ),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(new Response("<not-xml<<<", { status: 200 }));

    const result = await listObjectsClient(mock.connectionConfig(), mock.credentials(), {});

    expect(result.contents.map((o) => o.Key)).toEqual(["a.tif"]);
    expect(result.isCapped).toBe(true);
  });

  test("first-page Firefox-style malformed XML (parsererror as child) throws", async () => {
    // Firefox keeps the original `<ListBucketResult>` as the document
    // element and injects a `<parsererror>` child instead of replacing the
    // root, so the older Chromium-only check (`root.nodeName === 'parsererror'`)
    // misses it.
    fetchMock.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <parsererror>oops</parsererror>
  <IsTruncated>false</IsTruncated>
</ListBucketResult>`,
        { status: 200 },
      ),
    );

    await expect(
      listObjectsClient(mock.connectionConfig(), mock.credentials(), {}),
    ).rejects.toThrow(/Failed to parse ListBucketResult XML/);
  });

  test("first-page TypeError 'Failed to fetch' throws CorsLikelyError", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      listObjectsClient(mock.connectionConfig(), mock.credentials(), {}),
    ).rejects.toBeInstanceOf(CorsLikelyError);
  });

  test("non-TypeError network failures stay as-is (not CorsLikelyError)", async () => {
    const original = new Error("ECONNRESET");
    fetchMock.mockRejectedValueOnce(original);

    await expect(listObjectsClient(mock.connectionConfig(), mock.credentials(), {})).rejects.toBe(
      original,
    );
  });

  test("retries once after STS refresh on ExpiredToken", async () => {
    __resetCredentialsRefresher();
    const refresher = vi.fn().mockResolvedValue(mock.credentials({ AccessKeyId: "REFRESHED" }));
    setCredentialsRefresher(refresher);

    fetchMock.mockResolvedValueOnce(
      new Response(`<Error><Code>ExpiredToken</Code></Error>`, { status: 400 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(xml(`<IsTruncated>false</IsTruncated>${contentsXml(["a.tif"])}`), {
        status: 200,
      }),
    );

    const result = await listObjectsClient(
      mock.connectionConfig({ name: "conn-a" }),
      mock.credentials(),
      {},
    );

    expect(refresher).toHaveBeenCalledWith("conn-a");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.contents.map((o) => o.Key)).toEqual(["a.tif"]);
    __resetCredentialsRefresher();
  });

  test("throws ExpiredCredentialsError when retry also fails", async () => {
    __resetCredentialsRefresher();
    const refresher = vi.fn().mockResolvedValue(mock.credentials());
    setCredentialsRefresher(refresher);

    fetchMock.mockResolvedValue(
      new Response(`<Error><Code>ExpiredToken</Code></Error>`, { status: 400 }),
    );

    await expect(
      listObjectsClient(mock.connectionConfig({ name: "conn-a" }), mock.credentials(), {}),
    ).rejects.toBeInstanceOf(ExpiredCredentialsError);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    __resetCredentialsRefresher();
  });

  test("throws ExpiredCredentialsError without installed refresher", async () => {
    __resetCredentialsRefresher();
    fetchMock.mockResolvedValueOnce(
      new Response(`<Error><Code>ExpiredToken</Code></Error>`, { status: 400 }),
    );

    await expect(
      listObjectsClient(mock.connectionConfig({ name: "conn-a" }), mock.credentials(), {}),
    ).rejects.toBeInstanceOf(ExpiredCredentialsError);
  });

  test("S3 <Error> response document throws with the embedded code in the message", async () => {
    // Well-formed S3 error responses parse cleanly but with `<Error>` as
    // the root — surface the embedded code/message so callers don't have
    // to re-parse the body.
    fetchMock.mockResolvedValueOnce(
      new Response(
        `<?xml version="1.0" encoding="UTF-8"?>
<Error>
  <Code>AccessDenied</Code>
  <Message>Access Denied for this prefix</Message>
  <RequestId>ABCDEF1234567890</RequestId>
</Error>`,
        { status: 200 },
      ),
    );

    await expect(
      listObjectsClient(mock.connectionConfig(), mock.credentials(), {}),
    ).rejects.toThrow(/S3 error: AccessDenied Access Denied for this prefix/);
  });
});
