import { Table } from "apache-arrow";

import { resolveResourceId } from "../../connectionsStore/selectors";
import { createDatabase } from "../createDatabase";
import { getGeomQuery } from "../getGeomQuery";
import { getTileDataWasm } from "../getTileDataWasm";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../createDatabase", () => ({
  createDatabase: vi.fn(),
}));

vi.mock("../getGeomQuery", () => ({
  getGeomQuery: vi.fn(),
}));

vi.mock("../../connectionsStore/selectors", () => ({
  resolveResourceId: vi.fn(),
}));

describe("getTileDataWasm", () => {
  const mockQuery = vi.fn();
  const mockConnection = { query: mockQuery };
  const defaultTileIndex = { z: 0, x: 0, y: 0 };
  const connectionConfig = mock.connectionConfig();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDatabase).mockResolvedValue(mockConnection as never);
    vi.mocked(getGeomQuery).mockReturnValue("SELECT * FROM test");
    vi.mocked(resolveResourceId).mockReturnValue({
      connectionName: "my-conn",
      pathName: "data/file.parquet",
      credentials: mock.credentials(),
      connectionConfig,
      s3Uri: `s3://${connectionConfig.bucketName}/data/file.parquet`,
      httpsUrl: `https://${connectionConfig.bucketName}.s3.eu-central-1.amazonaws.com/data/file.parquet`,
    });
  });

  test("returns data table on successful query", async () => {
    const mockTable = { numRows: 10 } as unknown as Table;
    mockQuery.mockResolvedValue(mockTable);

    const result = await getTileDataWasm("my-conn/data/file.parquet", defaultTileIndex);

    expect(result).toBe(mockTable);
    expect(getGeomQuery).toHaveBeenCalledWith(
      `s3://${connectionConfig.bucketName}/data/file.parquet`,
      defaultTileIndex,
      [],
    );
  });

  test("returns null for empty result set", async () => {
    const mockTable = { numRows: 0 };
    mockQuery.mockResolvedValue(mockTable);

    const result = await getTileDataWasm("my-conn/data/file.parquet", defaultTileIndex);

    expect(result).toBeNull();
  });

  test("passes marker columns to getGeomQuery", async () => {
    const mockTable = { numRows: 5 };
    mockQuery.mockResolvedValue(mockTable);
    const markerColumns = ["marker1", "marker2", "marker3"];

    await getTileDataWasm("my-conn/data/file.parquet", defaultTileIndex, markerColumns);

    expect(getGeomQuery).toHaveBeenCalledWith(
      `s3://${connectionConfig.bucketName}/data/file.parquet`,
      defaultTileIndex,
      markerColumns,
    );
  });

  test("throws error on database failure", async () => {
    vi.mocked(createDatabase).mockRejectedValue(new Error("Database connection failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getTileDataWasm("my-conn/path", defaultTileIndex),
    ).rejects.toThrow("Database connection failed");

    consoleSpy.mockRestore();
  });

  test("throws error on query failure", async () => {
    mockQuery.mockRejectedValue(new Error("Query failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getTileDataWasm("my-conn/path", defaultTileIndex),
    ).rejects.toThrow("Query failed");

    consoleSpy.mockRestore();
  });
});
