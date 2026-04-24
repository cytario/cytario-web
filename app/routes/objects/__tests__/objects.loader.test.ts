import { NotFound, type S3Client } from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockGetConnection = vi.fn();
const mockGetS3Client = vi.fn();

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

vi.spyOn(console, "error").mockImplementation(() => {});

async function runLoader(params: Record<string, string>, context: unknown) {
  const { loader } = await import("~/routes/objects/objects.loader");
  try {
    const result = await loader({
      params,
      context,
      request: new Request("http://localhost/connections/" + params.name),
    } as unknown as LoaderFunctionArgs);
    return { result, thrown: undefined as undefined | Response };
  } catch (error) {
    if (error instanceof Response) return { result: undefined as never, thrown: error };
    throw error;
  }
}

describe("objects.loader", () => {
  const user = mock.user();
  const credentials = mock.credentials();
  const connectionConfig = mock.connectionConfig({
    name: "test-conn",
    bucketName: "test-bucket",
    prefix: "data",
  });

  const createContext = () => ({
    get: () => ({
      user,
      credentials: { "test-conn": credentials },
    }),
    set: vi.fn(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns connection-stable metadata only (no urlPath / pathName / name / isPinned)", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    mockGetS3Client.mockResolvedValue({
      send: vi.fn().mockResolvedValue({}),
    } as unknown as S3Client);

    const { result } = await runLoader(
      { name: "test-conn", "*": "foo/bar" },
      createContext(),
    );

    expect(result.connectionName).toBe("test-conn");
    expect(result.bucketName).toBe("test-bucket");
    expect(result.connectionConfig).toBeTruthy();
    expect(result.credentials).toBeTruthy();
    const raw = result as unknown as Record<string, unknown>;
    expect(raw.urlPath).toBeUndefined();
    expect(raw.pathName).toBeUndefined();
    expect(raw.name).toBeUndefined();
    expect(raw.isPinned).toBeUndefined();
    expect(raw.nodes).toBeUndefined();
    expect(raw.isSingleFile).toBeUndefined();
  });

  test("returns metadata when HeadObject succeeds (index exists)", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const sendMock = vi.fn().mockResolvedValue({});
    mockGetS3Client.mockResolvedValue({ send: sendMock } as unknown as S3Client);

    const { result, thrown } = await runLoader(
      { name: "test-conn", "*": "" },
      createContext(),
    );

    expect(thrown).toBeUndefined();
    expect(result).toBeTruthy();
    expect(sendMock).toHaveBeenCalledTimes(1); // just the HeadObject probe
  });

  test("redirects to /connectionIndex/:name when HeadObject returns NotFound", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const sendMock = vi
      .fn()
      .mockRejectedValue(new NotFound({ message: "nf", $metadata: {} }));
    mockGetS3Client.mockResolvedValue({ send: sendMock } as unknown as S3Client);

    const { thrown } = await runLoader(
      { name: "test-conn", "*": "" },
      createContext(),
    );

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown?.status).toBe(302);
    expect(thrown?.headers.get("Location")).toBe("/connectionIndex/test-conn");
  });

  test("returns notification when probe fails with a non-NotFound error", async () => {
    mockGetConnection.mockResolvedValue(connectionConfig);
    const sendMock = vi.fn().mockRejectedValue(new Error("Network error"));
    mockGetS3Client.mockResolvedValue({ send: sendMock } as unknown as S3Client);

    const { result } = await runLoader(
      { name: "test-conn", "*": "" },
      createContext(),
    );

    expect(result.notification?.status).toBe("error");
    expect(result.notification?.message).toMatch(/index/i);
  });
});
