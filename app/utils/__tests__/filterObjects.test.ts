import { _Object } from "@aws-sdk/client-s3";
import { describe, expect, test } from "vitest";

import { filterObjects } from "../filterObjects";

const testCases: [string, _Object[], { prefix?: string; query?: string }, _Object[]][] = [
  [
    "filter objects by query",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    { query: "file1" },
    [{ Key: "folder1/file1.tif" }],
  ],
  [
    "sort objects alphabetically by key",
    [{ Key: "file2.tif" }, { Key: "file1.tif" }, { Key: "folder1/file3.tif" }],
    {},
    [{ Key: "file1.tif" }, { Key: "file2.tif" }, { Key: "folder1/file3.tif" }],
  ],
  [
    "return empty array if no objects match the query",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    { query: "notfound" },
    [],
  ],
  [
    "handle objects without a query or prefix",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    {},
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
  ],
  ["drop objects with empty key", [{ Key: "" }], {}, []],
];

describe("filterObjects", () => {
  test.each(testCases)("%s", (_, objects, filters, expected) => {
    const result = filterObjects(objects, filters);
    expect(result).toEqual(expected);
  });
});
