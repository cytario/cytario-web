import { _Object } from "@aws-sdk/client-s3";
import { describe, expect, test, vi } from "vitest";

import { filterObjects } from "../filterObjects";

vi.mock("~/config", () => ({
  cytarioConfig: { setup: { allowedFiles: /\.((tif|tiff))$/ } },
}));

const testCases: [
  string,
  _Object[],
  { prefix?: string; query?: string },
  _Object[]
][] = [
  [
    "filter objects by query",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.tif" }],
    { query: "file1" },
    [{ Key: "folder1/file1.tif" }],
  ],
  [
    "apply allowed file pattern filter",
    [{ Key: "folder1/file1.tif" }, { Key: "folder2/file2.pdf" }],
    {},
    [{ Key: "folder1/file1.tif" }],
  ],
  [
    "sort objects with directories first",
    [{ Key: "file2.tif" }, { Key: "file1.tif" }, { Key: "folder1/file3.tif" }],
    {},
    [{ Key: "folder1/file3.tif" }, { Key: "file1.tif" }, { Key: "file2.tif" }],
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
  ["handle objects with empty key properties", [{ Key: "" }], {}, []],
];

describe("filterObjects", () => {
  test.each(testCases)("%s", (_, objects, filters, expected) => {
    process.env.ALLOWED_FILES = ".*\\.tif"; // Mock ALLOWED_FILES pattern for the pattern filter test case
    const result = filterObjects(objects, filters);
    expect(result).toEqual(expected);
  });
});
