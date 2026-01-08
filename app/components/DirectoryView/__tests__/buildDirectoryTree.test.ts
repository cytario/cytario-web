import { _Object } from "@aws-sdk/client-s3";

import { buildDirectoryTree } from "../buildDirectoryTree";

describe("buildDirectoryTree", () => {
  test("should correctly build a directory tree from a flat list of objects", () => {
    const objects: _Object[] = [
      {
        Key: "folder1/file1.txt",
        Size: 100,
        LastModified: new Date("2024-01-01"),
      },
      {
        Key: "folder1/file2.txt",
        Size: 200,
        LastModified: new Date("2024-01-02"),
      },
      {
        Key: "folder2/file3.txt",
        Size: 300,
        LastModified: new Date("2024-01-03"),
      },
      {
        Key: "folder2/subfolder1/file4.txt",
        Size: 400,
        LastModified: new Date("2024-01-04"),
      },
    ];

    const tree = buildDirectoryTree("test-bucket", objects);

    // Check top-level structure
    expect(tree).toHaveLength(2);

    // Check folder1
    const folder1 = tree.find((n) => n.name === "folder1");
    expect(folder1).toBeDefined();
    expect(folder1?.type).toBe("directory");
    expect(folder1?.children).toHaveLength(2);
    expect(folder1?.children.map((c) => c.name)).toContain("file1.txt");
    expect(folder1?.children.map((c) => c.name)).toContain("file2.txt");

    // Check folder2
    const folder2 = tree.find((n) => n.name === "folder2");
    expect(folder2).toBeDefined();
    expect(folder2?.type).toBe("directory");
    expect(folder2?.children).toHaveLength(2);

    // Check subfolder1 inside folder2
    const subfolder1 = folder2?.children.find((n) => n.name === "subfolder1");
    expect(subfolder1).toBeDefined();
    expect(subfolder1?.type).toBe("directory");
    expect(subfolder1?.children).toHaveLength(1);
    expect(subfolder1?.children[0].name).toBe("file4.txt");
    expect(subfolder1?.children[0].type).toBe("file");
  });

  test("should set correct id as full resourceId (no trailing slash)", () => {
    const objects: _Object[] = [{ Key: "parent/child/file.txt" }];

    const tree = buildDirectoryTree("test-bucket", objects);

    // id includes bucketKey prefix, no trailing slashes
    expect(tree[0].id).toBe("test-bucket/parent");
    expect(tree[0].children[0].id).toBe("test-bucket/parent/child");
    expect(tree[0].children[0].children[0].id).toBe(
      "test-bucket/parent/child/file.txt"
    );
  });

  test("should handle prefix correctly", () => {
    const objects: _Object[] = [{ Key: "prefix/folder/file.txt" }];

    const tree = buildDirectoryTree("test-bucket", objects, "prefix/");

    // Should strip prefix, so folder is at root level
    expect(tree[0].name).toBe("folder");
    // id includes full path with prefix
    expect(tree[0].id).toBe("test-bucket/prefix/folder");
  });

  test("should return empty array for empty input", () => {
    const tree = buildDirectoryTree("test-bucket", []);
    expect(tree).toEqual([]);
  });

  test("should correctly identify S3 directory markers (keys ending with /)", () => {
    const objects: _Object[] = [
      { Key: "Empty Folder/" }, // Directory marker with space
      { Key: "file.txt", Size: 100 },
    ];

    const tree = buildDirectoryTree("test-bucket", objects);

    const emptyFolder = tree.find((n) => n.name === "Empty Folder");
    const file = tree.find((n) => n.name === "file.txt");

    expect(emptyFolder?.type).toBe("directory");
    expect(emptyFolder?.id).toBe("test-bucket/Empty Folder");

    expect(file?.type).toBe("file");
    expect(file?.id).toBe("test-bucket/file.txt");
  });
});
