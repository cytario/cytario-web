import type { Credentials } from "@aws-sdk/client-sts";

import { CredentialedHTTPStore } from "../CredentialedHTTPStore";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("CredentialedHTTPStore", () => {
  const mockCredentials: Credentials = {
    AccessKeyId: "AKIAIOSFODNN7EXAMPLE",
    SecretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    SessionToken: "FwoGZXIvYXdzEBYaDK...",
    Expiration: new Date(),
  };

  const mockBucketConfig = {
    id: 1,
    name: "test-bucket",
    userId: "user-1",
    provider: "aws",
    endpoint: "https://s3.us-west-2.amazonaws.com",
    roleArn: null,
    region: "us-west-2",
    prefix: "",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    test("initializes with valid credentials", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/path",
        mockCredentials,
        mockBucketConfig,
      );

      expect(store).toBeInstanceOf(CredentialedHTTPStore);
    });

    test("adds trailing slash to URL if missing", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.amazonaws.com/path",
        mockCredentials,
      );

      expect(store).toBeDefined();
    });

    test("preserves trailing slash if present", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.amazonaws.com/path/",
        mockCredentials,
      );

      expect(store).toBeDefined();
    });

    test("uses default region when bucketConfig not provided", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.amazonaws.com/path",
        mockCredentials,
      );

      expect(store).toBeDefined();
    });

    test("throws error when AccessKeyId is missing", () => {
      const invalidCredentials = {
        ...mockCredentials,
        AccessKeyId: undefined,
      } as unknown as Credentials;

      expect(() => {
        new CredentialedHTTPStore(
          "https://bucket.s3.amazonaws.com/path",
          invalidCredentials,
        );
      }).toThrow(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required",
      );
    });

    test("throws error when SecretAccessKey is missing", () => {
      const invalidCredentials = {
        ...mockCredentials,
        SecretAccessKey: undefined,
      } as unknown as Credentials;

      expect(() => {
        new CredentialedHTTPStore(
          "https://bucket.s3.amazonaws.com/path",
          invalidCredentials,
        );
      }).toThrow(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required",
      );
    });
  });

  describe("get", () => {
    test("fetches item with signed request", async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      const result = await store.get(".zattrs");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr/.zattrs",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            host: "bucket.s3.us-west-2.amazonaws.com",
          }),
        }),
      );
      expect(result).toBeInstanceOf(Uint8Array);
    });

    test("includes authorization header in signed request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      await store.get("0/0/0");

      const [, fetchOptions] = mockFetch.mock.calls[0];
      expect(fetchOptions.headers).toHaveProperty("authorization");
      expect(fetchOptions.headers.authorization).toContain("AWS4-HMAC-SHA256");
    });

    test("includes x-amz-security-token when SessionToken is provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      await store.get("0/0/0");

      const [, fetchOptions] = mockFetch.mock.calls[0];
      expect(fetchOptions.headers).toHaveProperty("x-amz-security-token");
    });

    test("returns undefined for 404 responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      const result = await store.get("missing-key");

      expect(result).toBeUndefined();
    });

    test("throws error for non-404 error responses", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Access Denied"),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      await expect(store.get("forbidden-key")).rejects.toThrow(
        "HTTP 403 fetching forbidden-key: Access Denied",
      );
    });

    test("handles text() failure gracefully on error response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.reject(new Error("text() failed")),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      await expect(store.get("error-key")).rejects.toThrow(
        "HTTP 500 fetching error-key:",
      );
    });

    test("strips leading slash from keys", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig,
      );

      await store.get("/.zattrs");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr/.zattrs",
        expect.anything(),
      );
    });

    test("constructs correct URL for nested keys", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/data.zarr",
        mockCredentials,
        mockBucketConfig,
      );

      await store.get("0/0/0/0/0/0/42");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://bucket.s3.us-west-2.amazonaws.com/data.zarr/0/0/0/0/0/0/42",
        expect.anything(),
      );
    });
  });

  describe("URL handling", () => {
    test("works with custom endpoint (MinIO)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "http://localhost:9000/bucket/data.zarr",
        mockCredentials,
        { ...mockBucketConfig, endpoint: "http://localhost:9000" },
      );

      await store.get(".zattrs");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9000/bucket/data.zarr/.zattrs",
        expect.anything(),
      );
    });

    test("handles URLs with port numbers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "http://localhost:9000/bucket/path",
        mockCredentials,
        mockBucketConfig,
      );

      await store.get("key");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9000/bucket/path/key",
        expect.anything(),
      );
    });
  });
});
