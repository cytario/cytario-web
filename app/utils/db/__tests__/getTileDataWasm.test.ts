import { Table } from "apache-arrow";

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

describe("getTileDataWasm", () => {
  const mockQuery = vi.fn();
  const mockConnection = { query: mockQuery };
  const defaultTileIndex = { z: 0, x: 0, y: 0 };
  const credentials = mock.credentials();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDatabase).mockResolvedValue(mockConnection as never);
    vi.mocked(getGeomQuery).mockReturnValue("SELECT * FROM test");
  });

  test("returns data table on successful query", async () => {
    const mockTable = { numRows: 10 } as unknown as Table;
    mockQuery.mockResolvedValue(mockTable);

    const result = await getTileDataWasm(
      "bucket/path",
      defaultTileIndex,
      credentials
    );

    expect(result).toBe(mockTable);
    expect(createDatabase).toHaveBeenCalledWith(
      "bucket/path",
      credentials,
      undefined
    );
    expect(getGeomQuery).toHaveBeenCalledWith("bucket/path", defaultTileIndex, []);
  });

  test("returns null for empty result set", async () => {
    const mockTable = { numRows: 0 };
    mockQuery.mockResolvedValue(mockTable);

    const result = await getTileDataWasm(
      "bucket/path",
      defaultTileIndex,
      credentials
    );

    expect(result).toBeNull();
  });

  test("passes marker columns to getGeomQuery", async () => {
    const mockTable = { numRows: 5 };
    mockQuery.mockResolvedValue(mockTable);
    const markerColumns = ["marker1", "marker2", "marker3"];

    await getTileDataWasm(
      "bucket/path",
      defaultTileIndex,
      credentials,
      markerColumns
    );

    expect(getGeomQuery).toHaveBeenCalledWith(
      "bucket/path",
      defaultTileIndex,
      markerColumns
    );
  });

  test("passes bucket config to createDatabase", async () => {
    const mockTable = { numRows: 5 };
    mockQuery.mockResolvedValue(mockTable);
    const bucketConfig = mock.clientBucketConfig({
      endpoint: "https://minio.local:9000",
    });

    await getTileDataWasm(
      "bucket/path",
      defaultTileIndex,
      credentials,
      [],
      bucketConfig
    );

    expect(createDatabase).toHaveBeenCalledWith(
      "bucket/path",
      credentials,
      bucketConfig
    );
  });

  test("throws error on database failure", async () => {
    const dbError = new Error("Database connection failed");
    vi.mocked(createDatabase).mockRejectedValue(dbError);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getTileDataWasm("bucket/path", defaultTileIndex, credentials)
    ).rejects.toThrow("Database connection failed");

    expect(consoleSpy).toHaveBeenCalledWith(
      "[getTileDataWasm] Error fetching tile data:",
      dbError
    );
    consoleSpy.mockRestore();
  });

  test("throws error on query failure", async () => {
    const queryError = new Error("Query failed");
    mockQuery.mockRejectedValue(queryError);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getTileDataWasm("bucket/path", defaultTileIndex, credentials)
    ).rejects.toThrow("Query failed");

    expect(consoleSpy).toHaveBeenCalledWith(
      "[getTileDataWasm] Error fetching tile data:",
      queryError
    );
    consoleSpy.mockRestore();
  });

  test("uses different tile indices", async () => {
    const mockTable = { numRows: 3 };
    mockQuery.mockResolvedValue(mockTable);
    const tileIndex = { z: 5, x: 10, y: 20 };

    await getTileDataWasm("bucket/path", tileIndex, credentials);

    expect(getGeomQuery).toHaveBeenCalledWith("bucket/path", tileIndex, []);
  });
});
