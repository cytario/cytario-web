import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { getPresignedUrl } from "../getPresignedUrl";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: vi.fn(),
  S3Client: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

describe("getPresignedUrl", () => {
  const mockBucketConfig = mock.bucketConfig({
    name: "test-bucket",
    region: "us-west-2",
  });

  const mockS3Client = {} as S3Client;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSignedUrl).mockResolvedValue(
      "https://test-bucket.s3.amazonaws.com/test-key?X-Amz-Signature=abc123"
    );
  });

  test("creates GetObjectCommand with correct bucket and key", async () => {
    await getPresignedUrl(mockBucketConfig, mockS3Client, "path/to/file.txt");

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "path/to/file.txt",
    });
  });

  test("calls getSignedUrl with S3 client and command", async () => {
    await getPresignedUrl(mockBucketConfig, mockS3Client, "test-key");

    expect(getSignedUrl).toHaveBeenCalledWith(
      mockS3Client,
      expect.any(Object),
      expect.objectContaining({
        expiresIn: 3600, // 1 hour
      })
    );
  });

  test("returns presigned URL", async () => {
    const expectedUrl =
      "https://test-bucket.s3.amazonaws.com/my-file.pdf?X-Amz-Signature=xyz";
    vi.mocked(getSignedUrl).mockResolvedValue(expectedUrl);

    const result = await getPresignedUrl(
      mockBucketConfig,
      mockS3Client,
      "my-file.pdf"
    );

    expect(result).toBe(expectedUrl);
  });

  test("sets 1 hour expiration", async () => {
    await getPresignedUrl(mockBucketConfig, mockS3Client, "test-key");

    const [, , options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(options?.expiresIn).toBe(60 * 60 * 1);
  });

  test("handles keys with special characters", async () => {
    await getPresignedUrl(
      mockBucketConfig,
      mockS3Client,
      "folder/sub folder/file (1).txt"
    );

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "test-bucket",
      Key: "folder/sub folder/file (1).txt",
    });
  });

  test("handles different bucket names", async () => {
    const differentBucket = mock.bucketConfig({
      name: "another-bucket",
    });

    await getPresignedUrl(differentBucket, mockS3Client, "test-key");

    expect(GetObjectCommand).toHaveBeenCalledWith({
      Bucket: "another-bucket",
      Key: "test-key",
    });
  });

  test("propagates errors from getSignedUrl", async () => {
    vi.mocked(getSignedUrl).mockRejectedValue(new Error("Signing failed"));

    await expect(
      getPresignedUrl(mockBucketConfig, mockS3Client, "test-key")
    ).rejects.toThrow("Signing failed");
  });
});
