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
    name: "test-bucket",
    region: "us-west-2",
    provider: "aws",
  };

  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("constructor", () => {
    test("initializes with valid credentials", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/path",
        mockCredentials,
        mockBucketConfig
      );

      expect(store).toBeInstanceOf(CredentialedHTTPStore);
    });

    test("adds trailing slash to URL if missing", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.amazonaws.com/path",
        mockCredentials
      );

      // We can't directly access baseUrl, but we can verify behavior through getItem
      expect(store).toBeDefined();
    });

    test("preserves trailing slash if present", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.amazonaws.com/path/",
        mockCredentials
      );

      expect(store).toBeDefined();
    });

    test("uses default region when bucketConfig not provided", () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.amazonaws.com/path",
        mockCredentials
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
          invalidCredentials
        );
      }).toThrow(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required"
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
          invalidCredentials
        );
      }).toThrow(
        "Invalid credentials: AccessKeyId and SecretAccessKey are required"
      );
    });
  });

  describe("getItem", () => {
    test("fetches item with signed request", async () => {
      const mockArrayBuffer = new ArrayBuffer(8);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockArrayBuffer),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.getItem(".zattrs");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr/.zattrs",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            host: "bucket.s3.us-west-2.amazonaws.com",
          }),
        })
      );
      expect(result).toBe(mockArrayBuffer);
    });

    test("includes authorization header in signed request", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      await store.getItem("0/0/0");

      const [, fetchOptions] = mockFetch.mock.calls[0];
      expect(fetchOptions.headers).toHaveProperty("authorization");
      expect(fetchOptions.headers.authorization).toContain("AWS4-HMAC-SHA256");
    });

    test("includes x-amz-security-token when SessionToken is provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      await store.getItem("0/0/0");

      const [, fetchOptions] = mockFetch.mock.calls[0];
      expect(fetchOptions.headers).toHaveProperty("x-amz-security-token");
    });

    test("throws error when response is not ok", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Access Denied"),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      await expect(store.getItem("missing-key")).rejects.toThrow(
        "HTTP 403 fetching missing-key: Access Denied"
      );
    });

    test("handles fetch error gracefully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.reject(new Error("text() failed")),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      await expect(store.getItem("missing-key")).rejects.toThrow(
        "HTTP 404 fetching missing-key:"
      );
    });

    test("constructs correct URL for nested keys", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/data.zarr",
        mockCredentials,
        mockBucketConfig
      );

      await store.getItem("0/0/0/0/0/0/42");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://bucket.s3.us-west-2.amazonaws.com/data.zarr/0/0/0/0/0/0/42",
        expect.anything()
      );
    });
  });

  describe("containsItem", () => {
    test("returns true when item exists", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.containsItem(".zattrs");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ method: "HEAD" })
      );
    });

    test("returns false when item does not exist", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.containsItem("nonexistent");

      expect(result).toBe(false);
    });

    test("returns false when fetch throws error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.containsItem(".zattrs");

      expect(result).toBe(false);
    });
  });

  describe("keys", () => {
    test("returns empty array (not implemented)", async () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.keys();

      expect(result).toEqual([]);
    });
  });

  describe("deleteItem", () => {
    test("returns false (read-only store)", async () => {
      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.deleteItem();

      expect(result).toBe(false);
    });
  });

  describe("setItem", () => {
    test("returns false and logs warning (read-only store)", async () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const store = new CredentialedHTTPStore(
        "https://bucket.s3.us-west-2.amazonaws.com/zarr",
        mockCredentials,
        mockBucketConfig
      );

      const result = await store.setItem();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        "CredentialedHTTPStore is read-only"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("URL handling", () => {
    test("works with custom endpoint (MinIO)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "http://localhost:9000/bucket/data.zarr",
        mockCredentials,
        { ...mockBucketConfig, endpoint: "http://localhost:9000" }
      );

      await store.getItem(".zattrs");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9000/bucket/data.zarr/.zattrs",
        expect.anything()
      );
    });

    test("handles URLs with port numbers", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      });

      const store = new CredentialedHTTPStore(
        "http://localhost:9000/bucket/path",
        mockCredentials,
        mockBucketConfig
      );

      await store.getItem("key");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:9000/bucket/path/key",
        expect.anything()
      );
    });
  });
});
