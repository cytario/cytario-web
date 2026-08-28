// SDS-CY-010016 prototype retention.
//
// The host wraps each `LoaderLevel` in `useChannelsLayer` via
//
//   const originalGetTile = level.getTile.bind(level);
//   const wrapped = Object.create(Object.getPrototypeOf(level));
//   Object.assign(wrapped, level);
//   wrapped.getTile = async (params) => { ... originalGetTile(params); };
//
// The wrap pattern depends on three properties of any
// plugin-supplied `LoaderLevel`:
//
//   (1) `getTile` is callable from the level instance
//       (own property OR method on the class prototype chain);
//   (2) `Object.getPrototypeOf(level)` returns the same prototype the
//       runtime can use to construct an object with the same shape;
//   (3) `Object.assign(wrapped, level)` copies enumerable own props so
//       the wrap inherits `shape`, `dtype`, `labels`, `tileSize`, etc.
//
// This test pins those expectations against the two natural plugin
// shapes: a class instance (most viv-style loaders) and a POJO
// (zarrita-style stores).

import type { LoaderLevel, RasterData, TileRequest } from "@cytario/plugin-api";

class ClassLoaderLevel implements LoaderLevel {
  shape = [1, 1, 100, 100];
  dtype = "Uint16";
  labels = ["t", "c", "y", "x"];
  tileSize = 256;

  async getTile(req: TileRequest): Promise<RasterData> {
    return {
      data: Uint16Array.from([req.x, req.y]),
      width: this.tileSize,
      height: this.tileSize,
    };
  }

  async getRaster(): Promise<RasterData> {
    return { data: new Uint16Array(0), width: 0, height: 0 };
  }
}

function wrap(level: LoaderLevel): LoaderLevel & {
  invocations: number;
} {
  const originalGetTile = level.getTile.bind(level);
  const wrapped = Object.create(Object.getPrototypeOf(level));
  Object.assign(wrapped, level);
  wrapped.invocations = 0;
  wrapped.getTile = async (req: TileRequest): Promise<RasterData> => {
    wrapped.invocations += 1;
    return originalGetTile(req);
  };
  return wrapped;
}

describe("loader-level wrap pattern (SDS-CY-010016)", () => {
  test("preserves own props from a class-instance LoaderLevel", () => {
    const level = new ClassLoaderLevel();
    const wrapped = wrap(level);

    expect(wrapped.shape).toEqual(level.shape);
    expect(wrapped.dtype).toBe(level.dtype);
    expect(wrapped.labels).toEqual(level.labels);
    expect(wrapped.tileSize).toBe(level.tileSize);
  });

  test("getTile dispatches to the original via bind for a class instance", async () => {
    const level = new ClassLoaderLevel();
    const wrapped = wrap(level);

    const result = await wrapped.getTile({
      x: 7,
      y: 11,
      selection: { c: 0, t: 0, z: 0, x: 7, y: 11 },
    });

    expect(wrapped.invocations).toBe(1);
    expect(Array.from(result.data)).toEqual([7, 11]);
  });

  test("works equally well with a POJO LoaderLevel (no class)", async () => {
    const pojo: LoaderLevel = {
      shape: [1, 1, 50, 50],
      dtype: "Uint8",
      labels: ["t", "c", "y", "x"],
      tileSize: 128,
      async getTile(req) {
        return {
          data: new Uint8Array([req.x, req.y]),
          width: this.tileSize,
          height: this.tileSize,
        };
      },
      async getRaster() {
        return { data: new Uint8Array(0), width: 0, height: 0 };
      },
    };

    const wrapped = wrap(pojo);
    const result = await wrapped.getTile({
      x: 3,
      y: 5,
      selection: { c: 0, t: 0, z: 0, x: 3, y: 5 },
    });

    expect(wrapped.tileSize).toBe(128);
    expect(Array.from(result.data)).toEqual([3, 5]);
  });

  test("Object.getPrototypeOf(level) survives the wrap", () => {
    const level = new ClassLoaderLevel();
    const wrapped = wrap(level);

    // wrapped was built off the same prototype as `level`. instanceof
    // therefore still finds ClassLoaderLevel on the prototype chain —
    // the very property useChannelsLayer relies on.
    expect(wrapped).toBeInstanceOf(ClassLoaderLevel);
  });
});
