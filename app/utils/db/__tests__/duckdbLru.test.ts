import { selectBundle, createWorker, AsyncDuckDB } from "@duckdb/duckdb-wasm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { createDatabase } from "../createDatabase";
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
    instances = [];
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

    expect(instances).toHaveLength(1);
  });

  test("evicts and terminates the oldest instance beyond the LRU cap", async () => {
    await createDatabase("lru-a", credentials, undefined);
    await createDatabase("lru-b", credentials, undefined);
    await createDatabase("lru-c", credentials, undefined);
    terminated.length = 0; // evictions of prior tests' handles excluded
    await createDatabase("lru-d", credentials, undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(terminated).toHaveLength(1);
    expect(instances[0].connection.close).toHaveBeenCalledTimes(1);
    expect(instances[instances.length - 1].connection.close).not.toHaveBeenCalled();
  });

  test("an LRU touch keeps a recently used instance alive", async () => {
    await createDatabase("lru-e", credentials, undefined);
    await createDatabase("lru-f", credentials, undefined);
    await createDatabase("lru-g", credentials, undefined);
    const touched = instances[0]; // lru-e
    await createDatabase("lru-e", credentials, undefined); // touch — lru-f is now oldest
    terminated.length = 0;
    await createDatabase("lru-h", credentials, undefined);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(terminated).toHaveLength(1);
    expect(terminated[0]).not.toBe(touched);
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
