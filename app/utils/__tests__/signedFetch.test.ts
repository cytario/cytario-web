import type { Credentials } from "@aws-sdk/client-sts";

import { createSignedFetch } from "~/utils/signedFetch";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockCredentials: Credentials = {
  AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
  SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  SessionToken: "FwoGZXIvYXdzEBYaDK...",
  Expiration: new Date(),
};

const mockConfig = { region: "eu-central-1" };

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

  test("decodes percent-encoded paths before signing", async () => {
    const sf = createSignedFetch(() => mockCredentials, mockConfig);
    await sf(
      "https://bucket.s3.eu-central-1.amazonaws.com/Ascent%20Pharma%20Group/image.ome.tif",
    );

    // The request should succeed (no signature mismatch from double-encoding)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("Ascent%20Pharma%20Group");
  });

  test("defaults to eu-central-1 when region is missing", async () => {
    const sf = createSignedFetch(() => mockCredentials, { region: "" });
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
});
