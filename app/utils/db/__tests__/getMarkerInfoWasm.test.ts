import { resolveResourceId } from "../../connectionsStore/selectors";
import { createDatabase } from "../createDatabase";
import { getMarkerInfoWasm } from "../getMarkerInfoWasm";
import type { OverlayConfig } from "../overlayConfig";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("../createDatabase", () => ({
  createDatabase: vi.fn(),
  releaseDatabase: vi.fn(),
}));

vi.mock("../../connectionsStore/selectors", () => ({
  resolveResourceId: vi.fn(),
}));

describe("getMarkerInfoWasm", () => {
  const mockQuery = vi.fn();
  const mockConnection = { query: mockQuery };
  const connectionConfig = mock.connectionConfig();

  const config = (classes: OverlayConfig["classes"]): OverlayConfig => ({
    version: 1,
    columns: { id: "object", geometry: "geom", x: "x", y: "y" },
    classes,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createDatabase).mockResolvedValue(mockConnection as never);
    vi.mocked(resolveResourceId).mockReturnValue({
      connectionId: "my-conn-id",
      pathName: "data/file.parquet",
      credentials: mock.credentials(),
      connectionConfig,
      region: "eu-central-1",
      endpoint: null,
      s3Uri: `s3://${connectionConfig.bucketName}/data/file.parquet`,
      httpsUrl: `https://${connectionConfig.bucketName}.s3.eu-central-1.amazonaws.com/data/file.parquet`,
    });
  });

  test("builds boolean-class counts via boolean casts", async () => {
    mockQuery.mockResolvedValue({
      toArray: () => [{ marker_positive_cd4: 10n, is_tumor: 5n }],
    });

    const result = await getMarkerInfoWasm(
      "my-conn/data/file.parquet",
      config([
        { sourceColumn: "marker_positive_cd4", label: "cd4", mode: "boolean" },
        { sourceColumn: "is_tumor", label: "tumor", mode: "boolean" },
      ]),
    );

    expect(result).toEqual({ marker_positive_cd4: { count: 10 }, is_tumor: { count: 5 } });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain(`SUM(CAST(CAST("marker_positive_cd4" AS BOOLEAN) AS INTEGER))`);
    expect(sql).toContain(`SUM(CAST(CAST("is_tumor" AS BOOLEAN) AS INTEGER))`);
    expect(sql).toContain(`read_parquet('s3://${connectionConfig.bucketName}/data/file.parquet')`);
  });

  test.each([">", ">=", "<", "<=", "=", "!="] as const)(
    "builds threshold counts with the %s operator",
    async (operator) => {
      mockQuery.mockResolvedValue({ toArray: () => [{ intensity: 3n }] });

      await getMarkerInfoWasm(
        "my-conn/data/file.parquet",
        config([
          { sourceColumn: "intensity", label: "i", mode: "threshold", operator, threshold: 1.5 },
        ]),
      );

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain(`SUM(CAST(("intensity" ${operator} 1.5) AS INTEGER)) AS "intensity"`);
    },
  );

  test("keeps the legacy marker_positive_ regex without a config", async () => {
    mockQuery.mockResolvedValue({
      toArray: () => [{ marker_positive_cd4: 7n }],
    });

    const result = await getMarkerInfoWasm("my-conn/data/file.parquet");

    expect(result).toEqual({ marker_positive_cd4: { count: 7 } });
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("SUM(COLUMNS('marker_positive_.*'))");
  });

  test("treats null counts as zero", async () => {
    mockQuery.mockResolvedValue({ toArray: () => [{ empty: null }] });

    const result = await getMarkerInfoWasm(
      "my-conn/data/file.parquet",
      config([{ sourceColumn: "empty", label: "e", mode: "boolean" }]),
    );

    expect(result).toEqual({ empty: { count: 0 } });
  });

  test("rethrows query failures", async () => {
    mockQuery.mockRejectedValue(new Error("Query failed"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      getMarkerInfoWasm(
        "my-conn/data/file.parquet",
        config([{ sourceColumn: "x", label: "x", mode: "boolean" }]),
      ),
    ).rejects.toThrow("Query failed");

    consoleSpy.mockRestore();
  });
});
