import { selectBundle, createWorker, AsyncDuckDB } from "@duckdb/duckdb-wasm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createDatabase, releaseDatabase, __resetDuckDbHandlesForTests } from "../createDatabase";
import { getLocalDuckDbBundles } from "../duckdbBundles";
import mock from "~/utils/__tests__/__mocks__";

vi.mock("@duckdb/duckdb-wasm", () => ({
  selectBundle: vi.fn(),
  createWorker: vi.fn(),
  AsyncDuckDB: vi.fn(),
  ConsoleLogger: vi.fn(),
}));

vi.mock("../duckdbBundles", () => ({
  getLocalDuckDbBundles: vi.fn(),
}));

vi.mock("../../s3Provider", () => ({
  shouldUseSSL: vi.fn(() => true),
  getEndpointHostname: vi.fn(() => "s3.amazonaws.com"),
}));

describe("DuckDB instance LRU", () => {
  const credentials = mock.credentials();

  interface Instance {
    terminate: ReturnType<typeof vi.fn>;
    connection: { query: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
  }

  let instances: Instance[];
  let terminated: Instance[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    __resetDuckDbHandlesForTests();
    instances = [];
    terminated = [];

    vi.mocked(getLocalDuckDbBundles).mockReturnValue({} as never);
    vi.mocked(selectBundle).mockResolvedValue({
      mainWorker: "worker.js",
      mainModule: "module.wasm",
      pthreadWorker: "pthread.js",
    } as never);
    vi.mocked(createWorker).mockImplementation(async () => ({}) as never);
    vi.mocked(AsyncDuckDB).mockImplementation(() => {
      // `db` is what eviction terminates — terminate belongs on the outer
      // AsyncDuckDB mock, not on the per-connect instance.
      const instance: Instance = {
        terminate: vi.fn().mockImplementation(async () => {
          terminated.push(instance);
        }),
        connection: {
          query: vi.fn().mockResolvedValue({}),
          close: vi.fn().mockResolvedValue(undefined),
        },
      };
      instances.push(instance);
      return {
        instantiate: vi.fn().mockResolvedValue(undefined),
        open: vi.fn().mockResolvedValue(undefined),
        connect: vi.fn().mockResolvedValue(instance.connection),
        terminate: instance.terminate,
      } as never;
    });
  });

  test("reuses one instance per resourceId", async () => {
    await createDatabase("lru-reuse", credentials, undefined);
    await createDatabase("lru-reuse", credentials, undefined);
    await releaseDatabase("lru-reuse");
    await releaseDatabase("lru-reuse");

    expect(instances).toHaveLength(1);
  });

  test("evicts and terminates the oldest instance beyond the LRU cap", async () => {
    for (const id of ["lru-a", "lru-b", "lru-c"]) {
      await createDatabase(id, credentials, undefined);
      await releaseDatabase(id);
    }
    await createDatabase("lru-d", credentials, undefined);
    await releaseDatabase("lru-d");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(terminated).toHaveLength(1);
    expect(instances[0].connection.close).toHaveBeenCalledTimes(1);
    expect(instances[instances.length - 1].connection.close).not.toHaveBeenCalled();
  });

  test("an LRU touch keeps a recently used instance alive", async () => {
    for (const id of ["lru-e", "lru-f", "lru-g"]) {
      await createDatabase(id, credentials, undefined);
      await releaseDatabase(id);
    }
    const touched = instances[0]; // lru-e
    await createDatabase("lru-e", credentials, undefined); // touch — lru-f is now oldest
    await releaseDatabase("lru-e");
    await createDatabase("lru-h", credentials, undefined);
    await releaseDatabase("lru-h");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(terminated).toHaveLength(1);
    expect(terminated[0]).not.toBe(touched);
  });

  test("an in-flight borrow defers eviction: not terminated until released", async () => {
    // Borrowed and held — mimics an in-flight sidecar read on the oldest entry.
    await createDatabase("race-a", credentials, undefined);
    for (const id of ["race-b", "race-c"]) {
      await createDatabase(id, credentials, undefined);
      await releaseDatabase(id);
    }
    const borrowed = instances[0]; // race-a's instance (LRU-oldest)
    await createDatabase("race-d", credentials, undefined);
    await releaseDatabase("race-d");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The borrowed instance was evicted from the LRU but NOT terminated.
    expect(terminated).toHaveLength(0);
    expect(borrowed.connection.close).not.toHaveBeenCalled();

    // Last release drains the borrow — termination happens then.
    await releaseDatabase("race-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(terminated).toHaveLength(1);
    expect(terminated[0]).toBe(borrowed);
  });

  test("a re-requested evicted handle is resurrected, not duplicated", async () => {
    // Borrow and hold, then fill the LRU so the next open evicts it.
    await createDatabase("res-a", credentials, undefined);
    for (const id of ["res-b", "res-c"]) {
      await createDatabase(id, credentials, undefined);
      await releaseDatabase(id);
    }
    const borrowed = instances[0]; // res-a's instance (LRU-oldest)
    await createDatabase("res-d", credentials, undefined);
    await releaseDatabase("res-d");
    const before = instances.length;

    // Request the evicted-but-borrowed resource again — resurrect, no new instance.
    await createDatabase("res-a", credentials, undefined);
    await releaseDatabase("res-a");
    await releaseDatabase("res-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(instances).toHaveLength(before);
    expect(borrowed.connection.close).not.toHaveBeenCalled();
  });

  test("an evicted handle with multiple borrows terminates after the last release", async () => {
    await createDatabase("multi-a", credentials, undefined);
    await createDatabase("multi-a", credentials, undefined); // second borrow
    for (const id of ["multi-b", "multi-c"]) {
      await createDatabase(id, credentials, undefined);
      await releaseDatabase(id);
    }
    const borrowed = instances[0]; // multi-a's instance (LRU-oldest)
    await createDatabase("multi-d", credentials, undefined);
    await releaseDatabase("multi-d");

    await releaseDatabase("multi-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(borrowed.connection.close).not.toHaveBeenCalled(); // one borrow still out

    await releaseDatabase("multi-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(borrowed.connection.close).toHaveBeenCalledTimes(1);
  });

  test("a failed init under cap pressure does not poison the resourceId", async () => {
    let created = 0;
    let failFirst = true;
    vi.mocked(AsyncDuckDB).mockImplementation(
      () =>
        ({
          instantiate: vi.fn(async () => {
            created += 1;
            if (failFirst) {
              failFirst = false;
              throw new Error("init failed under pressure");
            }
            return undefined;
          }),
          open: vi.fn().mockResolvedValue(undefined),
          connect: vi.fn().mockResolvedValue({ query: vi.fn().mockResolvedValue({}) }),
          terminate: vi.fn(),
        }) as never,
    );

    // Start the doomed create but do NOT await it yet.
    const doomed = createDatabase("poison-a", credentials, undefined);
    // Cap pressure while it is still initializing — evictBeyondCap parks
    // poison-a (borrows > 0) into evictedHandles before the init rejects.
    for (const id of ["poison-b", "poison-c", "poison-d"]) {
      await createDatabase(id, credentials, undefined);
      await releaseDatabase(id);
    }
    await expect(doomed).rejects.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The rejected handle must be gone from every map — a retry builds fresh.
    await createDatabase("poison-a", credentials, undefined);
    await releaseDatabase("poison-a");
    expect(created).toBe(5); // poison-a(failed) + poison-b/c/d + poison-a(retry)
  });

  test("an eviction racing a create-in-flight defers termination past both borrows", async () => {
    // Slow-init instances so the borrows are outstanding when eviction runs.
    let initGate: Promise<void> = Promise.resolve();
    vi.mocked(AsyncDuckDB).mockImplementation(() => {
      const instance: Instance = {
        terminate: vi.fn().mockImplementation(async () => {
          terminated.push(instance);
        }),
        connection: {
          query: vi.fn().mockResolvedValue({}),
          close: vi.fn().mockResolvedValue(undefined),
        },
      };
      instances.push(instance);
      return {
        instantiate: vi.fn().mockImplementation(async () => {
          await initGate;
        }),
        open: vi.fn().mockResolvedValue(undefined),
        connect: vi.fn().mockResolvedValue(instance.connection),
        terminate: instance.terminate,
      } as never;
    });

    let releaseGate!: () => void;
    initGate = new Promise((resolve) => (releaseGate = resolve));

    // Two concurrent creates on the same pending init + one on a second id.
    const first = createDatabase("inter-a", credentials, undefined);
    const second = createDatabase("inter-a", credentials, undefined);
    const third = createDatabase("inter-b", credentials, undefined);
    await new Promise((resolve) => setTimeout(resolve, 0)); // borrows taken, inits pending

    releaseGate();
    const [connA1, connA2, connB] = await Promise.all([first, second, third]);

    // Same connection for both inter-a borrows; distinct for inter-b.
    expect(connA1).toBe(connA2);
    expect(connB).not.toBe(connA1);
    releaseDatabase("inter-a");
    releaseDatabase("inter-a");
    releaseDatabase("inter-b");
    await new Promise((resolve) => setTimeout(resolve, 20));

    // No termination fired while borrows were outstanding — cap never exceeded
    // (2 < 3), and both creates resolved on a live connection.
    expect(terminated).toHaveLength(0);
    expect(instances).toHaveLength(2);
  });

  test("a failed init is not kept and not terminated as a live handle", async () => {
    let created = 0;
    vi.mocked(AsyncDuckDB).mockImplementation(
      () =>
        ({
          instantiate: vi.fn(async () => {
            created += 1;
            if (created === 1) throw new Error("init failed");
            return undefined;
          }),
          open: vi.fn().mockResolvedValue(undefined),
          connect: vi.fn().mockResolvedValue({ query: vi.fn().mockResolvedValue({}) }),
          terminate: vi.fn(),
        }) as never,
    );

    await expect(createDatabase("lru-fail", credentials, undefined)).rejects.toThrow();
    await createDatabase("lru-fail", credentials, undefined);
    expect(created).toBe(2);
  });
});
