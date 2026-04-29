import { NotFound, type S3Client } from "@aws-sdk/client-s3";
import { LoaderFunctionArgs } from "react-router";

import mock from "~/utils/__tests__/__mocks__";

const mockContextGet = vi.fn();

vi.mock("~/.server/connection/connectionMiddleware", () => ({
  connectionContext: { get: vi.fn() },
  connectionMiddleware: vi.fn(),
}));

vi.spyOn(console, "error").mockImplementation(() => {});

const connectionConfig = mock.connectionConfig({
  name: "test-conn",
  bucketName: "test-bucket",
  prefix: "data",
});

const seedContext = (sendMock: ReturnType<typeof vi.fn>) => {
  mockContextGet.mockReturnValue({
    connectionConfig,
    credentials: mock.credentials(),
    s3Client: { send: sendMock } as unknown as S3Client,
  });
};

async function runLoader() {
  const { loader } = await import("~/routes/objects/objects.loader");
  try {
    const result = await loader({
      params: { name: "test-conn", "*": "" },
      context: { get: mockContextGet, set: vi.fn() } as never,
      request: new Request("http://localhost/connections/test-conn"),
    } as unknown as LoaderFunctionArgs);
    return { result, thrown: undefined as undefined | Response };
  } catch (error) {
    if (error instanceof Response) return { result: undefined as never, thrown: error };
    throw error;
  }
}

describe("objects.loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("returns connection-stable metadata only (no urlPath / pathName / name / isPinned)", async () => {
    seedContext(vi.fn().mockResolvedValue({}));

    const { result } = await runLoader();

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
    const sendMock = vi.fn().mockResolvedValue({});
    seedContext(sendMock);

    const { result, thrown } = await runLoader();

    expect(thrown).toBeUndefined();
    expect(result).toBeTruthy();
    expect(sendMock).toHaveBeenCalledTimes(1); // just the HeadObject probe
  });

  test("redirects to /connectionIndex/:name when HeadObject returns NotFound", async () => {
    seedContext(
      vi.fn().mockRejectedValue(new NotFound({ message: "nf", $metadata: {} })),
    );

    const { thrown } = await runLoader();

    expect(thrown).toBeInstanceOf(Response);
    expect(thrown?.status).toBe(302);
    expect(thrown?.headers.get("Location")).toBe("/connectionIndex/test-conn");
  });

  test("returns notification when probe fails with a non-NotFound error", async () => {
    seedContext(vi.fn().mockRejectedValue(new Error("Network error")));

    const { result } = await runLoader();

    expect(result.notification?.status).toBe("error");
    expect(result.notification?.message).toMatch(/index/i);
  });
});
