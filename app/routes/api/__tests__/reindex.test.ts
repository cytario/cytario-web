import { ActionFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockGetConnectionByAlias = vi.fn();
const mockCanModify = vi.fn();
const mockGetS3Client = vi.fn();
const mockListAllObjects = vi.fn();
const mockBuildIndexParquet = vi.fn();

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {
    get: vi.fn(),
  },
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/auth/authorization", () => ({
  canModify: (...args: unknown[]) => mockCanModify(...args),
}));
vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: (...args: unknown[]) => mockGetS3Client(...args),
}));
vi.mock("~/.server/reindex/buildIndex", () => ({
  buildIndexParquet: (...args: unknown[]) => mockBuildIndexParquet(...args),
}));
vi.mock("~/.server/reindex/listAllObjects", () => ({
  listAllObjects: (...args: unknown[]) => mockListAllObjects(...args),
}));
vi.mock("~/.server/requestDurationMiddleware", () => ({
  requestDurationMiddleware: vi.fn(),
}));
vi.mock("~/utils/connectionConfig.server", () => ({
  getConnectionByAlias: (...args: unknown[]) =>
    mockGetConnectionByAlias(...args),
}));

// Suppress console.info and console.error in tests
vi.spyOn(console, "info").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});

describe("reindex.$alias action", () => {
  const user = mock.user();
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    alias: "test-conn",
    name: "test-bucket",
    provider: "aws",
    prefix: "data",
    ownerScope: "org1/lab",
  });

  const createContext = () => {
    const contextMap = new Map();
    return {
      get: () => ({
        user,
        credentials: { "test-bucket": credentials },
      }),
      set: vi.fn(),
      _map: contextMap,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 400 when alias is missing", async () => {
    const { action } = await import("~/routes/api/reindex.$alias");

    const response = await action({
      params: {},
      context: createContext(),
      request: new Request("http://localhost/api/reindex/"),
    } as unknown as ActionFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
  });

  test("returns 404 when connection config not found", async () => {
    mockGetConnectionByAlias.mockResolvedValue(null);

    const { action } = await import("~/routes/api/reindex.$alias");

    const response = await action({
      params: { alias: "nonexistent" },
      context: createContext(),
      request: new Request("http://localhost/api/reindex/nonexistent"),
    } as unknown as ActionFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
  });

  test("returns 403 when user cannot modify the connection", async () => {
    mockGetConnectionByAlias.mockResolvedValue(connectionConfig);
    mockCanModify.mockReturnValue(false);

    const { action } = await import("~/routes/api/reindex.$alias");

    const response = await action({
      params: { alias: "test-conn" },
      context: createContext(),
      request: new Request("http://localhost/api/reindex/test-conn"),
    } as unknown as ActionFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(403);
    expect(mockCanModify).toHaveBeenCalledWith(user, "org1/lab");
  });

  test("returns 401 when no credentials for bucket", async () => {
    mockGetConnectionByAlias.mockResolvedValue(connectionConfig);
    mockCanModify.mockReturnValue(true);

    const contextWithoutCreds = {
      get: () => ({
        user,
        credentials: {},
      }),
      set: vi.fn(),
    };

    const { action } = await import("~/routes/api/reindex.$alias");

    const response = await action({
      params: { alias: "test-conn" },
      context: contextWithoutCreds,
      request: new Request("http://localhost/api/reindex/test-conn"),
    } as unknown as ActionFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  test("builds and uploads index on success", async () => {
    mockGetConnectionByAlias.mockResolvedValue(connectionConfig);
    mockCanModify.mockReturnValue(true);
    mockGetS3Client.mockResolvedValue({ send: vi.fn() });
    mockListAllObjects.mockResolvedValue([
      { Key: "file1.txt", Size: 100 },
      { Key: "file2.txt", Size: 200 },
    ]);
    mockBuildIndexParquet.mockResolvedValue(Buffer.from("parquet-data"));

    const { action } = await import("~/routes/api/reindex.$alias");

    const response = await action({
      params: { alias: "test-conn" },
      context: createContext(),
      request: new Request("http://localhost/api/reindex/test-conn"),
    } as unknown as ActionFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    const json = await (response as Response).json();
    expect(json.objectCount).toBe(2);
    expect(json.builtAt).toBeDefined();
  });

  test("returns 500 on indexing failure", async () => {
    mockGetConnectionByAlias.mockResolvedValue(connectionConfig);
    mockCanModify.mockReturnValue(true);
    mockGetS3Client.mockRejectedValue(new Error("S3 connection failed"));

    const { action } = await import("~/routes/api/reindex.$alias");

    const response = await action({
      params: { alias: "test-conn" },
      context: createContext(),
      request: new Request("http://localhost/api/reindex/test-conn"),
    } as unknown as ActionFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(500);
  });
});
