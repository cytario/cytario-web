import { buildConnectionPath, toIndexS3Key } from "../resourceId";

describe("toIndexS3Key", () => {
  test("returns index key without prefix", () => {
    expect(toIndexS3Key()).toBe(".cytario/index.parquet");
  });

  test("returns index key with empty prefix", () => {
    expect(toIndexS3Key("")).toBe(".cytario/index.parquet");
  });

  test("returns index key with prefix", () => {
    expect(toIndexS3Key("data")).toBe("data/.cytario/index.parquet");
  });

  test("strips trailing slash from prefix", () => {
    expect(toIndexS3Key("data/images/")).toBe(
      "data/images/.cytario/index.parquet",
    );
  });

  test("handles nested prefix", () => {
    expect(toIndexS3Key("org/lab/experiment")).toBe(
      "org/lab/experiment/.cytario/index.parquet",
    );
  });
});

describe("buildConnectionPath", () => {
  test("returns connection path with empty pathName", () => {
    expect(buildConnectionPath("my-conn", "")).toBe("/connections/my-conn");
  });

  test("returns connection path with pathName", () => {
    expect(buildConnectionPath("my-conn", "folder/file.txt")).toBe(
      "/connections/my-conn/folder/file.txt",
    );
  });

  test("strips trailing slash", () => {
    expect(buildConnectionPath("my-conn", "folder/")).toBe("/connections/my-conn/folder");
  });
});
