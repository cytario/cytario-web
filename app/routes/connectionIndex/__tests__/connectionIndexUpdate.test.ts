import { type S3Client } from "@aws-sdk/client-s3";
import { ActionFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockContextGet = vi.fn();
const mockDuckRun = vi.fn();
const mockDuckGetRowObjects = vi.fn().mockResolvedValue([{ c: 42 }]);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from("fake-parquet"));
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock("~/.server/connection/connectionMiddleware", () => ({
  connectionContext: { get: vi.fn() },
  connectionMiddleware: vi.fn(),
}));

vi.mock("@duckdb/node-api", () => ({
  DuckDBInstance: {
    create: async () => ({
      connect: async () => ({
        run: (...args: unknown[]) => {
          mockDuckRun(...args);
          return { getRowObjects: mockDuckGetRowObjects };
        },
      }),
    }),
  },
}));
vi.mock("fs/promises", () => {
  const fns = {
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
    readFile: (...args: unknown[]) => mockReadFile(...args),
    unlink: (...args: unknown[]) => mockUnlink(...args),
  };
  return { ...fns, default: fns };
});

vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("connectionIndexUpdate (PATCH /connectionIndex/:connectionName?slice=…)", () => {
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    provider: "aws",
    prefix: "data",
  });

  const seedContext = (sendMock: ReturnType<typeof vi.fn>) => {
    mockContextGet.mockReturnValue({
      connectionConfig,
      credentials: mock.credentials(),
      s3Client: { send: sendMock } as unknown as S3Client,
    });
  };

  const invoke = async (url: string) => {
    const { connectionIndexUpdate } = await import(
      "~/routes/connectionIndex/connectionIndexUpdate"
    );
    return connectionIndexUpdate({
      params: { connectionName: "test-conn" },
      context: { get: mockContextGet, set: vi.fn() } as never,
      request: new Request(url, { method: "PATCH" }),
    } as unknown as ActionFunctionArgs);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDuckRun.mockResolvedValue(undefined);
    mockDuckGetRowObjects.mockResolvedValue([{ c: 42 }]);
    mockWriteFile.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from("fake-parquet"));
    mockUnlink.mockResolvedValue(undefined);
  });

  test("returns JSON { patched: true } on success", async () => {
    seedContext(
      vi.fn().mockResolvedValue({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        Contents: [],
      }),
    );

    const response = (await invoke(
      "http://localhost/connectionIndex/test-conn?slice=foo/",
    )) as Response;

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.patched).toBe(true);
    expect(json.objectCount).toBe(42);
  });

  test("rejects slice that would break SQL interpolation (single quote)", async () => {
    seedContext(vi.fn());

    const response = (await invoke(
      "http://localhost/connectionIndex/test-conn?slice=bad'slice",
    )) as Response;

    expect(response.status).toBe(400);
  });

  test("empty ?slice= is valid (patches the connection root slice)", async () => {
    seedContext(
      vi.fn().mockResolvedValue({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        Contents: [],
      }),
    );

    const response = (await invoke(
      "http://localhost/connectionIndex/test-conn?slice=",
    )) as Response;

    expect(response.status).toBe(200);
  });
});
