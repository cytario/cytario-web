import { describe, expect, test } from "vitest";

import { buildCreateTableQuery } from "../sqlQueries";

describe("buildCreateTableQuery", () => {
  test("interpolates the resource id into the read_csv_auto literal", () => {
    const sql = buildCreateTableQuery("s3://my-bucket/data/cells.csv");
    expect(sql).toContain("read_csv_auto('s3://my-bucket/data/cells.csv'");
  });

  test("uses the default `polygon` geometry column when none is supplied", () => {
    const sql = buildCreateTableQuery("s3://my-bucket/data/cells.csv");
    expect(sql).toContain('ST_GeomFromText("polygon")');
  });

  test("respects an explicit geometry column name", () => {
    const sql = buildCreateTableQuery("s3://my-bucket/data/cells.csv", "boundary");
    expect(sql).toContain('ST_GeomFromText("boundary")');
  });

  test("quotes the geometry column so arbitrary names stay valid identifiers", () => {
    const sql = buildCreateTableQuery("s3://my-bucket/data/cells.csv", 'geo "shape"');
    expect(sql).toContain('ST_GeomFromText("geo ""shape""")');
  });

  test("quotes a geometry column with spaces", () => {
    const sql = buildCreateTableQuery("s3://my-bucket/data/cells.csv", "cell boundary");
    expect(sql).toContain('ST_GeomFromText("cell boundary")');
  });

  test("escapes single quotes in the resource id", () => {
    // S3 keys may contain a literal `'`. An unescaped quote would
    // terminate the SQL string literal and inject the remainder.
    const sql = buildCreateTableQuery("s3://my-bucket/data/o'brien.csv");
    expect(sql).toContain("read_csv_auto('s3://my-bucket/data/o''brien.csv'");
    expect(sql).not.toContain("read_csv_auto('s3://my-bucket/data/o'brien.csv'");
  });

  test("escapes a quoted-injection attempt in the resource id", () => {
    const sql = buildCreateTableQuery("s3://b/a';DROP TABLE geometries;--");
    expect(sql).toContain("'s3://b/a'';DROP TABLE geometries;--'");
  });
});
