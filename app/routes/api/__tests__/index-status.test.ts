import { NotFound } from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockGetConnection = vi.fn();
const mockGetS3Client = vi.fn();

vi.mock("~/.server/auth/authMiddleware", () => ({
  authContext: {
    get: vi.fn(),
  },
  authMiddleware: vi.fn(),
}));
vi.mock("~/.server/auth/getS3Client", () => ({
  getS3Client: (...args: unknown[]) => mockGetS3Client(...args),
}));
vi.mock("~/.server/requestDurationMiddleware", () => ({
  requestDurationMiddleware: vi.fn(),
}));
vi.mock("~/routes/connections/connections.server", () => ({
  getConnection: (...args: unknown[]) =>
    mockGetConnection(...args),
}));

describe("index-status.$name loader", () => {
  const user = mock.user();
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    prefix: "",
  });

  const createContext = () => ({
    get: () => ({
      user,
      credentials: { "test-bucket": credentials },
    }),
    set: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns 400 when name is missing", async () => {
    const { loader } = await import("~/routes/api/index-status.$name");

    const response = await loader({
      params: {},
      context: createContext(),
      request: new Request("http://localhost/api/index-status/"),
    } as unknown as LoaderFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(400);
  });

  test("returns 404 when connection config not found", async () => {
    mockGetConnection.mockResolvedValue(null);

    const { loader } = await import("~/routes/api/index-status.$name");

    const response = await loader({
      params: { name: "nonexistent" },
      context: createContext(),
      request: new Request("http://localhost/api/index-status/nonexistent"),
    } as unknown as LoaderFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
  });

  test("returns 401 when no credentials for bucket", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);

    const contextWithoutCreds = {
      get: () => ({
        user,
        credentials: {},
      }),
      set: vi.fn(),
    };

    const { loader } = await import("~/routes/api/index-status.$name");

    const response = await loader({
      params: { name: "test-conn" },
      context: contextWithoutCreds,
      request: new Request("http://localhost/api/index-status/test-conn"),
    } as unknown as LoaderFunctionArgs);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
  });

  test("returns exists:true with metadata when index exists", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({
        Metadata: { "object-count": "1500" },
        LastModified: new Date("2025-06-15T12:00:00Z"),
      }),
    });

    const { loader } = await import("~/routes/api/index-status.$name");

    const response = await loader({
      params: { name: "test-conn" },
      context: createContext(),
      request: new Request("http://localhost/api/index-status/test-conn"),
    } as unknown as LoaderFunctionArgs);

    const json = await (response as Response).json();
    expect(json.exists).toBe(true);
    expect(json.objectCount).toBe(1500);
    expect(json.builtAt).toBe("2025-06-15T12:00:00.000Z");
  });

  test("returns exists:false when index file not found", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockRejectedValue(
        new NotFound({
          message: "Not found",
          $metadata: {},
        }),
      ),
    });

    const { loader } = await import("~/routes/api/index-status.$name");

    const response = await loader({
      params: { name: "test-conn" },
      context: createContext(),
      request: new Request("http://localhost/api/index-status/test-conn"),
    } as unknown as LoaderFunctionArgs);

    const json = await (response as Response).json();
    expect(json.exists).toBe(false);
  });

  test("rethrows non-NotFound errors", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockRejectedValue(new Error("Network error")),
    });

    const { loader } = await import("~/routes/api/index-status.$name");

    await expect(
      loader({
        params: { name: "test-conn" },
        context: createContext(),
        request: new Request("http://localhost/api/index-status/test-conn"),
      } as unknown as LoaderFunctionArgs),
    ).rejects.toThrow("Network error");
  });

  test("returns objectCount 0 when metadata has no object-count", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({
        Metadata: {},
        LastModified: new Date("2025-06-15T12:00:00Z"),
      }),
    });

    const { loader } = await import("~/routes/api/index-status.$name");

    const response = await loader({
      params: { name: "test-conn" },
      context: createContext(),
      request: new Request("http://localhost/api/index-status/test-conn"),
    } as unknown as LoaderFunctionArgs);

    const json = await (response as Response).json();
    expect(json.exists).toBe(true);
    expect(json.objectCount).toBe(0);
  });
});
