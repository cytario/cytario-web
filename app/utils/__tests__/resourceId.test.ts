import { nodeToPath, toIndexS3Key } from "../resourceId";

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

describe("nodeToPath", () => {
  test("returns connection path with empty pathName", () => {
    expect(nodeToPath({ connectionName: "my-conn", pathName: "" })).toBe("/connections/my-conn");
  });

  test("returns connection path with pathName", () => {
    expect(nodeToPath({ connectionName: "my-conn", pathName: "folder/file.txt" })).toBe(
      "/connections/my-conn/folder/file.txt",
    );
  });

  test("strips trailing slash from path", () => {
    expect(nodeToPath({ connectionName: "my-conn", pathName: "folder/" })).toBe(
      "/connections/my-conn/folder",
    );
  });

  test("returns path without trailing slash when pathName is empty", () => {
    expect(nodeToPath({ connectionName: "my-conn", pathName: "" })).toBe(
      "/connections/my-conn",
    );
  });
});
