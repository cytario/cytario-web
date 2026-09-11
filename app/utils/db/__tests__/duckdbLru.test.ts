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
    // The LRU is module state shared across tests in this file; evictions of
    // handles created by earlier tests land on their (cleared) mocks, so every
    // terminate is recorded here as well.
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
