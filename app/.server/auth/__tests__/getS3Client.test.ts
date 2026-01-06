import { S3Client } from "@aws-sdk/client-s3";

import { getS3Client, getS3ClientCacheStats } from "../getS3Client";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    config: {},
  })),
}));

vi.mock("~/utils/s3Provider", () => ({
  isAwsS3Endpoint: vi.fn((endpoint) => {
    if (!endpoint) return true;
    return endpoint.includes("amazonaws.com");
  }),
}));

describe("getS3Client", () => {
  const mockBucketConfig = mock.bucketConfig({
    name: "test-bucket",
    region: "us-west-2",
    endpoint: "https://s3.us-west-2.amazonaws.com",
  });

  const mockCredentials = mock.credentials({
    AccessKeyId: "AKIATEST123",
    SecretAccessKey: "secretkey123",
    SessionToken: "sessiontoken123",
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Client Creation", () => {
    test("creates S3Client with correct credentials", async () => {
      await getS3Client(mockBucketConfig, mockCredentials, "user-1");

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          credentials: {
            accessKeyId: "AKIATEST123",
            secretAccessKey: "secretkey123",
            sessionToken: "sessiontoken123",
          },
        })
      );
    });

    test("creates S3Client with correct region", async () => {
      await getS3Client(mockBucketConfig, mockCredentials, "user-2");

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: "us-west-2",
        })
      );
    });

    test("uses default region when bucket config has no region", async () => {
      const configNoRegion = mock.bucketConfig({
        name: "no-region-bucket",
        region: null,
      });

      await getS3Client(configNoRegion, mockCredentials, "user-3");

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          region: "eu-central-1",
        })
      );
    });

    test("returns S3Client instance", async () => {
      const client = await getS3Client(
        mockBucketConfig,
        mockCredentials,
        "user-4"
      );

      expect(client).toBeDefined();
      // Client should be the mock instance created by S3Client constructor
      expect(S3Client).toHaveBeenCalled();
    });
  });

  describe("Caching", () => {
    test("returns cached client on subsequent calls with same credentials", async () => {
      const creds = mock.credentials({
        AccessKeyId: "CACHE-TEST-KEY",
        SecretAccessKey: "cache-secret",
      });

      const client1 = await getS3Client(mockBucketConfig, creds, "cache-user");
      const callCount1 = vi.mocked(S3Client).mock.calls.length;

      const client2 = await getS3Client(mockBucketConfig, creds, "cache-user");
      const callCount2 = vi.mocked(S3Client).mock.calls.length;

      // Should be the same instance
      expect(client1).toBe(client2);
      // S3Client constructor should not be called again
      expect(callCount2).toBe(callCount1);
    });

    test("creates new client when credentials change", async () => {
      const creds1 = mock.credentials({
        AccessKeyId: "KEY1",
        SecretAccessKey: "secret1",
      });
      const creds2 = mock.credentials({
        AccessKeyId: "KEY2",
        SecretAccessKey: "secret2",
      });

      await getS3Client(mockBucketConfig, creds1, "changing-user");
      const callCount1 = vi.mocked(S3Client).mock.calls.length;

      await getS3Client(mockBucketConfig, creds2, "changing-user");
      const callCount2 = vi.mocked(S3Client).mock.calls.length;

      // Should create a new client
      expect(callCount2).toBe(callCount1 + 1);
    });

    test("creates new client for different users", async () => {
      const sharedCreds = mock.credentials({
        AccessKeyId: "SHARED-KEY",
        SecretAccessKey: "shared-secret",
      });

      await getS3Client(mockBucketConfig, sharedCreds, "user-a");
      const callCount1 = vi.mocked(S3Client).mock.calls.length;

      await getS3Client(mockBucketConfig, sharedCreds, "user-b");
      const callCount2 = vi.mocked(S3Client).mock.calls.length;

      // Different users should get different cache entries
      expect(callCount2).toBe(callCount1 + 1);
    });

    test("creates new client for different buckets", async () => {
      const creds = mock.credentials({
        AccessKeyId: "BUCKET-KEY",
        SecretAccessKey: "bucket-secret",
      });

      const bucket1 = mock.bucketConfig({ name: "bucket-1" });
      const bucket2 = mock.bucketConfig({ name: "bucket-2" });

      await getS3Client(bucket1, creds, "bucket-user");
      const callCount1 = vi.mocked(S3Client).mock.calls.length;

      await getS3Client(bucket2, creds, "bucket-user");
      const callCount2 = vi.mocked(S3Client).mock.calls.length;

      // Different buckets should create new clients
      expect(callCount2).toBe(callCount1 + 1);
    });
  });

  describe("Error Handling", () => {
    test("throws when AccessKeyId is missing", async () => {
      const invalidCreds = mock.credentials({
        AccessKeyId: undefined,
      });

      await expect(
        getS3Client(mockBucketConfig, invalidCreds, "error-user")
      ).rejects.toThrow("No Credentials");
    });

    test("throws when SecretAccessKey is missing", async () => {
      const invalidCreds = mock.credentials({
        SecretAccessKey: undefined,
      });

      await expect(
        getS3Client(mockBucketConfig, invalidCreds, "error-user")
      ).rejects.toThrow("No Credentials");
    });

    test("throws when userId is empty", async () => {
      await expect(
        getS3Client(mockBucketConfig, mockCredentials, "")
      ).rejects.toThrow("User ID is required for S3Client cache");
    });
  });

  describe("Non-AWS Endpoints", () => {
    test("sets endpoint for non-AWS S3 services", async () => {
      const minioConfig = mock.bucketConfig({
        name: "minio-bucket",
        endpoint: "http://localhost:9000",
        region: "us-east-1",
      });

      await getS3Client(minioConfig, mockCredentials, "minio-user");

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: "http://localhost:9000",
          forcePathStyle: true,
        })
      );
    });

    test("does not set endpoint for AWS S3", async () => {
      const awsConfig = mock.bucketConfig({
        name: "aws-bucket",
        endpoint: "https://s3.us-west-2.amazonaws.com",
        region: "us-west-2",
      });

      await getS3Client(awsConfig, mockCredentials, "aws-user");

      const callArgs = vi.mocked(S3Client).mock.calls[
        vi.mocked(S3Client).mock.calls.length - 1
      ]?.[0];

      expect(callArgs).not.toHaveProperty("endpoint");
      expect(callArgs?.forcePathStyle).toBe(false);
    });
  });

  describe("getS3ClientCacheStats", () => {
    test("returns cache statistics", () => {
      const stats = getS3ClientCacheStats();

      expect(stats).toHaveProperty("size");
      expect(stats).toHaveProperty("maxEntries");
      expect(stats).toHaveProperty("ttl");
      expect(stats.maxEntries).toBe(10000);
      expect(stats.ttl).toBe(3600000);
    });
  });
});
