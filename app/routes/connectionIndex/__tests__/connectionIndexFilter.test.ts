import type { _Object } from "@aws-sdk/client-s3";

import { connectionIndexFilter } from "~/routes/connectionIndex/connectionIndexFilter";

function obj(key: string): _Object {
  return { Key: key, Size: 0 };
}

describe("connectionIndexFilter", () => {
  test("accepts regular files", () => {
    const seen = new Set<string>();
    expect(connectionIndexFilter(obj("foo/bar.txt"), seen)).toBe(true);
    expect(connectionIndexFilter(obj("baz.png"), seen)).toBe(true);
  });

  test("rejects anything inside a .cytario/ directory at any depth", () => {
    const seen = new Set<string>();
    expect(connectionIndexFilter(obj(".cytario/index.parquet"), seen)).toBe(
      false,
    );
    expect(
      connectionIndexFilter(obj("prefix/.cytario/index.parquet"), seen),
    ).toBe(false);
    expect(
      connectionIndexFilter(obj("deep/nested/.cytario/whatever"), seen),
    ).toBe(false);
  });

  test("keeps only the first object encountered under each *.zarr/ root", () => {
    const seen = new Set<string>();
    expect(connectionIndexFilter(obj("img.zarr/.zattrs"), seen)).toBe(true);
    expect(connectionIndexFilter(obj("img.zarr/0/0"), seen)).toBe(false);
    expect(connectionIndexFilter(obj("img.zarr/1/0"), seen)).toBe(false);
    // A different zarr root is still accepted once.
    expect(connectionIndexFilter(obj("other.zarr/.zattrs"), seen)).toBe(true);
    expect(connectionIndexFilter(obj("other.zarr/0/0"), seen)).toBe(false);
  });

  test("zarr match is case-insensitive on the segment suffix", () => {
    const seen = new Set<string>();
    expect(connectionIndexFilter(obj("UPPER.ZARR/.zattrs"), seen)).toBe(true);
    expect(connectionIndexFilter(obj("UPPER.ZARR/0/0"), seen)).toBe(false);
    expect(connectionIndexFilter(obj("Mixed.Zarr/.zattrs"), seen)).toBe(true);
    expect(connectionIndexFilter(obj("Mixed.Zarr/0/0"), seen)).toBe(false);
  });

  test("does not collapse files whose names merely contain .zarr without a trailing /", () => {
    const seen = new Set<string>();
    expect(connectionIndexFilter(obj("notes-about-zarr.md"), seen)).toBe(true);
    expect(connectionIndexFilter(obj("archive.zarr.tar"), seen)).toBe(true);
  });

  test("ignores undefined Key (defensive)", () => {
    const seen = new Set<string>();
    expect(connectionIndexFilter({ Size: 0 } as _Object, seen)).toBe(true);
  });
});
