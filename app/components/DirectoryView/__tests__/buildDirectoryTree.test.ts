import { buildDirectoryTree } from "../buildDirectoryTree";
import { ObjectPresignedUrl } from "~/routes/objects.route";

describe("buildDirectoryTree", () => {
  test("should correctly build a directory tree from a flat list of objects", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "folder1/file1.txt", presignedUrl: "http://example.com/file1.txt" },
      { Key: "folder1/file2.txt", presignedUrl: "http://example.com/file1.txt" },
      { Key: "folder2/file3.txt", presignedUrl: "http://example.com/file1.txt" },
      { Key: "folder2/subfolder1/file4.txt", presignedUrl: "http://example.com/file1.txt" },
    ];

    const tree = buildDirectoryTree("test-bucket", objects, "test-provider", "test-connection", "root");

    expect(tree.type).toBe("directory");
    expect(tree.name).toBe("root");
    expect(tree.children).toHaveLength(2);

    const folder1 = tree.children![0];
    expect(folder1).toMatchObject({
      connectionName: "test-connection",
      type: "directory",
      name: "folder1",
      bucketName: "test-bucket",
      pathName: "folder1/",
      provider: "test-provider",
    });
    expect(folder1.children).toHaveLength(2);
    expect(folder1.children![0]).toMatchObject({
      type: "file",
      name: "file1.txt",
      pathName: "folder1/file1.txt",
      _Object: { Key: "folder1/file1.txt", presignedUrl: "http://example.com/file1.txt" },
    });
    expect(folder1.children![1]).toMatchObject({
      type: "file",
      name: "file2.txt",
      pathName: "folder1/file2.txt",
    });

    const folder2 = tree.children![1];
    expect(folder2).toMatchObject({
      type: "directory",
      name: "folder2",
      pathName: "folder2/",
    });
    expect(folder2.children).toHaveLength(2);
    expect(folder2.children![0]).toMatchObject({ type: "file", name: "file3.txt" });

    const subfolder1 = folder2.children![1];
    expect(subfolder1).toMatchObject({
      type: "directory",
      name: "subfolder1",
      pathName: "folder2/subfolder1/",
    });
    expect(subfolder1.children).toHaveLength(1);
    expect(subfolder1.children![0]).toMatchObject({
      type: "file",
      name: "file4.txt",
      pathName: "folder2/subfolder1/file4.txt",
    });
  });

  test("should prepend urlPath to node pathNames when navigating into a subdirectory", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "subdir/file.tif", presignedUrl: "https://example.com/file.tif" },
    ];

    // Simulate navigating into "subdir/" within a connection:
    // S3 prefix "subdir/" is stripped, but urlPath "subdir" anchors paths to connection root
    const tree = buildDirectoryTree(
      "my-bucket", objects, "aws", "my-connection", "subdir", "subdir/", "subdir",
    );

    expect(tree.children).toHaveLength(1);
    expect(tree.children![0]).toMatchObject({
      connectionName: "my-connection",
      type: "file",
      name: "file.tif",
      pathName: "subdir/file.tif",
      bucketName: "my-bucket",
      provider: "aws",
      _Object: { Key: "subdir/file.tif", presignedUrl: "https://example.com/file.tif" },
    });
  });

  test("should skip S3 folder marker objects (keys ending with /)", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "czi/", presignedUrl: "" },
      { Key: "czi/ULT-2022-16901-457_V1.czi", presignedUrl: "https://example.com/file.czi" },
    ];

    const tree = buildDirectoryTree("my-bucket", objects, "aws", "my-connection", "root");

    expect(tree.children).toHaveLength(1);
    expect(tree.children![0].type).toBe("directory");
    expect(tree.children![0].name).toBe("czi");
    expect(tree.children![0].children).toHaveLength(1);
    expect(tree.children![0].children![0].name).toBe("ULT-2022-16901-457_V1.czi");
    expect(tree.children![0].children![0].type).toBe("file");
  });

  test("should handle nested folder markers without creating phantom nodes", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "a/", presignedUrl: "" },
      { Key: "a/b/", presignedUrl: "" },
      { Key: "a/b/file.txt", presignedUrl: "https://example.com/file.txt" },
    ];

    const tree = buildDirectoryTree("my-bucket", objects, "aws", "my-connection", "root");

    expect(tree.children).toHaveLength(1);
    expect(tree.children![0].name).toBe("a");
    expect(tree.children![0].children).toHaveLength(1);
    expect(tree.children![0].children![0].name).toBe("b");
    expect(tree.children![0].children![0].children).toHaveLength(1);
    expect(tree.children![0].children![0].children![0].name).toBe("file.txt");
  });

  test("should produce paths relative to connection root without urlPath", () => {
    const objects: ObjectPresignedUrl[] = [
      { Key: "subdir/file.tif", presignedUrl: "https://example.com/file.tif" },
    ];

    const tree = buildDirectoryTree(
      "my-bucket", objects, "aws", "my-connection", "root",
    );

    expect(tree.children![0].pathName).toBe("subdir/");
    expect(tree.children![0].children![0].pathName).toBe("subdir/file.tif");
  });
});
