import { selectBundle, createWorker, AsyncDuckDB, ConsoleLogger } from "@duckdb/duckdb-wasm";

import { shouldUseSSL, getEndpointHostname } from "../../s3Provider";
import { createDatabase } from "../createDatabase";
import { getLocalDuckDbBundles } from "../duckdbBundles";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("@duckdb/duckdb-wasm", () => ({
  selectBundle: vi.fn(),
  createWorker: vi.fn(),
  AsyncDuckDB: vi.fn(),
  ConsoleLogger: vi.fn(),
}));

vi.mock("../duckdbBundles", () => ({
  getLocalDuckDbBundles: vi.fn(),
}));

vi.mock("../../s3Provider", () => ({
  shouldUseSSL: vi.fn(),
  getEndpointHostname: vi.fn(),
}));

describe("createDatabase", () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockInstantiate = vi.fn();
  const mockOpen = vi.fn();
  // Fresh per test: `appliedKeyIds` is keyed by connection identity, and a
  // shared mock object would carry "credentials already applied" across tests.
  let mockConnection: { query: typeof mockQuery };
  const credentials = mock.credentials();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});

    // Setup DuckDB mocks
    vi.mocked(getLocalDuckDbBundles).mockReturnValue({} as never);
    vi.mocked(selectBundle).mockResolvedValue({
      mainWorker: "worker.js",
      mainModule: "module.wasm",
      pthreadWorker: "pthread.js",
    } as never);
    vi.mocked(createWorker).mockResolvedValue({} as never);
    vi.mocked(AsyncDuckDB).mockImplementation(
      () =>
        ({
          instantiate: mockInstantiate,
          open: mockOpen,
          connect: mockConnect,
        }) as never,
    );
    mockConnection = { query: mockQuery };
    mockConnect.mockResolvedValue(mockConnection);
    mockQuery.mockResolvedValue({});

    // Setup s3Provider mocks
    vi.mocked(shouldUseSSL).mockReturnValue(true);
    vi.mocked(getEndpointHostname).mockReturnValue("s3.amazonaws.com");
  });

  test("initializes DuckDB WASM and returns connection", async () => {
    const connection = await createDatabase("test-resource", credentials, undefined);

    expect(connection).toBe(mockConnection);
    expect(getLocalDuckDbBundles).toHaveBeenCalled();
    expect(selectBundle).toHaveBeenCalled();
    expect(createWorker).toHaveBeenCalledWith("worker.js");
    expect(AsyncDuckDB).toHaveBeenCalledWith(expect.any(ConsoleLogger), {});
    expect(mockInstantiate).toHaveBeenCalledWith("module.wasm", "pthread.js");
    expect(mockConnect).toHaveBeenCalled();
  });

  test("loads httpfs extension", async () => {
    await createDatabase("test-httpfs", credentials, undefined);

    expect(mockQuery).toHaveBeenCalledWith("SET builtin_httpfs = false;");
    expect(mockQuery).toHaveBeenCalledWith("LOAD httpfs;");
  });

  test("does not eagerly install or load spatial extension", async () => {
    await createDatabase("test-no-spatial", credentials, undefined);

    expect(mockQuery).not.toHaveBeenCalledWith("INSTALL spatial;");
    expect(mockQuery).not.toHaveBeenCalledWith("LOAD spatial;");
  });

  test("enables caching settings", async () => {
    await createDatabase("test-caching", credentials, undefined);

    expect(mockQuery).toHaveBeenCalledWith("SET enable_object_cache = true;");
    expect(mockQuery).toHaveBeenCalledWith("SET http_keep_alive = true;");
  });

  test("configures S3 credentials", async () => {
    await createDatabase("test-credentials", credentials, undefined);

    expect(mockQuery).toHaveBeenCalledWith(`SET s3_access_key_id='${credentials.AccessKeyId}'`);
    expect(mockQuery).toHaveBeenCalledWith(
      `SET s3_secret_access_key='${credentials.SecretAccessKey}'`,
    );
    expect(mockQuery).toHaveBeenCalledWith(`SET s3_session_token='${credentials.SessionToken}'`);
  });

  test("configures S3 endpoint with default region", async () => {
    await createDatabase("test-endpoint", credentials, undefined);

    expect(mockQuery).toHaveBeenCalledWith("SET s3_region='eu-central-1'");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_endpoint='s3.amazonaws.com'");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_url_style='path'");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_use_ssl=true");
  });

  test("uses the resolved provider region when provided", async () => {
    await createDatabase("test-resource-region", credentials, { region: "us-west-2" });

    expect(mockQuery).toHaveBeenCalledWith("SET s3_region='us-west-2'");
  });

  test("configures endpoint from the resolved provider", async () => {
    vi.mocked(getEndpointHostname).mockReturnValue("minio.local:9000");
    vi.mocked(shouldUseSSL).mockReturnValue(true);

    await createDatabase("test-resource-minio", credentials, {
      endpoint: "https://minio.local:9000",
    });

    expect(getEndpointHostname).toHaveBeenCalledWith("https://minio.local:9000");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_endpoint='minio.local:9000'");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_url_style='path'");
  });

  test("throws error when worker is not available", async () => {
    vi.mocked(selectBundle).mockResolvedValue({
      mainWorker: null,
      mainModule: "module.wasm",
    } as never);

    await expect(createDatabase("test-resource-no-worker", credentials, undefined)).rejects.toThrow(
      "DuckDB WASM worker is not available",
    );
  });

  test("returns cached connection for same resourceId (singleton behavior)", async () => {
    const connection1 = await createDatabase("cached-resource", credentials, undefined);
    const connection2 = await createDatabase("cached-resource", credentials, undefined);

    expect(connection1).toBe(connection2);
    // Should only initialize once for same resource
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  test("escapes single quotes in credential values", async () => {
    const dangerousCreds = mock.credentials({
      AccessKeyId: "AKIA';DROP TABLE foo;--",
      SecretAccessKey: "secret'with'quotes",
      SessionToken: "tok'en",
    });

    await createDatabase("test-sql-inject", dangerousCreds, undefined);

    expect(mockQuery).toHaveBeenCalledWith("SET s3_access_key_id='AKIA'';DROP TABLE foo;--'");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_secret_access_key='secret''with''quotes'");
    expect(mockQuery).toHaveBeenCalledWith("SET s3_session_token='tok''en'");
  });
});
