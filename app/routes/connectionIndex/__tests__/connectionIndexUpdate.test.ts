import { ActionFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockGetConnection = vi.fn();
const mockGetS3Client = vi.fn();
const mockDuckRun = vi.fn();
const mockDuckGetRowObjects = vi.fn().mockResolvedValue([{ c: 42 }]);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(Buffer.from("fake-parquet"));
const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: { get: vi.fn() },
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: (...args: unknown[]) => mockGetS3Client(...args),
}));
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
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
  const user = mock.user();
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    provider: "aws",
    prefix: "data",
  });

  const createContext = () => ({
    get: () => ({
      user,
      credentials: { "test-bucket": credentials },
    }),
    set: vi.fn(),
  });

  const invoke = async (
    params: Record<string, string>,
    url: string,
    context: unknown = createContext(),
  ) => {
    const { connectionIndexUpdate } = await import(
      "~/routes/connectionIndex/connectionIndexUpdate"
    );
    return connectionIndexUpdate({
      params,
      context,
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

  test("returns 400 when connectionName is missing", async () => {
    const response = (await invoke(
      {},
      "http://localhost/connectionIndex/?slice=foo/",
    )) as Response;
    expect(response.status).toBe(400);
  });

  test("returns 404 when connection config not found", async () => {
    mockGetConnection.mockResolvedValue(null);
    const response = (await invoke(
      { connectionName: "missing" },
      "http://localhost/connectionIndex/missing?slice=foo/",
    )) as Response;
    expect(response.status).toBe(404);
  });

  test("returns 401 when no credentials for bucket", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const response = (await invoke(
      { connectionName: "test-conn" },
      "http://localhost/connectionIndex/test-conn?slice=foo/",
      { get: () => ({ user, credentials: {} }), set: vi.fn() },
    )) as Response;
    expect(response.status).toBe(401);
  });

  test("returns JSON { patched: true } on success", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        Contents: [],
      }),
    });

    const response = (await invoke(
      { connectionName: "test-conn" },
      "http://localhost/connectionIndex/test-conn?slice=foo/",
    )) as Response;

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.patched).toBe(true);
    expect(json.objectCount).toBe(42);
  });

  test("rejects slice that would break SQL interpolation (single quote)", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({ send: vi.fn() });

    const response = (await invoke(
      { connectionName: "test-conn" },
      "http://localhost/connectionIndex/test-conn?slice=bad'slice",
    )) as Response;

    expect(response.status).toBe(400);
  });

  test("empty ?slice= is valid (patches the connection root slice)", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const sendMock = vi.fn().mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      Contents: [],
    });
    mockGetS3Client.mockResolvedValue({ send: sendMock });

    const response = (await invoke(
      { connectionName: "test-conn" },
      "http://localhost/connectionIndex/test-conn?slice=",
    )) as Response;

    expect(response.status).toBe(200);
  });
});
