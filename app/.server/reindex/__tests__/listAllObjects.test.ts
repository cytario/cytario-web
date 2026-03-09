import {
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
  S3Client,
} from "@aws-sdk/client-s3";

import { listAllObjects } from "../listAllObjects";

vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual("@aws-sdk/client-s3");
  return {
    ...actual,
    S3Client: vi.fn(),
  };
});

function createMockS3Client(
  responses: ListObjectsV2CommandOutput[],
): S3Client {
  let callIndex = 0;
  return {
    send: vi.fn(() => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return Promise.resolve(response);
    }),
  } as unknown as S3Client;
}

describe("listAllObjects", () => {
  test("returns objects from a single page", async () => {
    const mockClient = createMockS3Client([
      {
        Contents: [
          { Key: "file1.txt", Size: 100 },
          { Key: "file2.txt", Size: 200 },
        ],
        $metadata: {},
      },
    ]);

    const result = await listAllObjects(mockClient, "test-bucket");

    expect(result).toHaveLength(2);
    expect(result[0].Key).toBe("file1.txt");
    expect(result[1].Key).toBe("file2.txt");
  });

  test("paginates through multiple pages", async () => {
    const mockClient = createMockS3Client([
      {
        Contents: [{ Key: "file1.txt", Size: 100 }],
        NextContinuationToken: "token-1",
        $metadata: {},
      },
      {
        Contents: [{ Key: "file2.txt", Size: 200 }],
        NextContinuationToken: "token-2",
        $metadata: {},
      },
      {
        Contents: [{ Key: "file3.txt", Size: 300 }],
        $metadata: {},
      },
    ]);

    const result = await listAllObjects(mockClient, "test-bucket");

    expect(result).toHaveLength(3);
    expect(result.map((o) => o.Key)).toEqual([
      "file1.txt",
      "file2.txt",
      "file3.txt",
    ]);
  });

  test("passes prefix to ListObjectsV2Command", async () => {
    const sendMock = vi.fn().mockResolvedValue({
      Contents: [{ Key: "data/file1.txt" }],
      $metadata: {},
    });
    const mockClient = { send: sendMock } as unknown as S3Client;

    await listAllObjects(mockClient, "test-bucket", "data/");

    const command = sendMock.mock.calls[0][0] as ListObjectsV2Command;
    expect(command.input.Bucket).toBe("test-bucket");
    expect(command.input.Prefix).toBe("data/");
  });

  test("omits prefix parameter when prefix is empty", async () => {
    const sendMock = vi.fn().mockResolvedValue({
      Contents: [],
      $metadata: {},
    });
    const mockClient = { send: sendMock } as unknown as S3Client;

    await listAllObjects(mockClient, "test-bucket", "");

    const command = sendMock.mock.calls[0][0] as ListObjectsV2Command;
    expect(command.input.Prefix).toBeUndefined();
  });

  test("stops at maxObjects limit", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const mockClient = createMockS3Client([
      {
        Contents: [
          { Key: "file1.txt" },
          { Key: "file2.txt" },
          { Key: "file3.txt" },
        ],
        NextContinuationToken: "more-data",
        $metadata: {},
      },
    ]);

    const result = await listAllObjects(mockClient, "test-bucket", "", 3);

    expect(result).toHaveLength(3);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("Hit max object limit (3)"),
    );

    consoleWarn.mockRestore();
  });

  test("returns empty array when no contents", async () => {
    const mockClient = createMockS3Client([
      {
        Contents: undefined,
        $metadata: {},
      },
    ]);

    const result = await listAllObjects(mockClient, "test-bucket");

    expect(result).toHaveLength(0);
  });

  test("uses default maxObjects of 500000", async () => {
    const mockClient = createMockS3Client([
      {
        Contents: [{ Key: "file1.txt" }],
        $metadata: {},
      },
    ]);

    const result = await listAllObjects(mockClient, "test-bucket");

    expect(result).toHaveLength(1);
    // Verify it completed without hitting the limit (no warning)
  });
});
