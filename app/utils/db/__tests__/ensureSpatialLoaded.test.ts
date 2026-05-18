import { ensureSpatialLoaded } from "../ensureSpatialLoaded";

describe("ensureSpatialLoaded", () => {
  test("issues INSTALL and LOAD on first call", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const connection = { query };

    await ensureSpatialLoaded(connection);

    expect(query).toHaveBeenCalledWith("INSTALL spatial;");
    expect(query).toHaveBeenCalledWith("LOAD spatial;");
  });

  test("does not re-issue on subsequent calls with same connection", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const connection = { query };

    await ensureSpatialLoaded(connection);
    await ensureSpatialLoaded(connection);
    await ensureSpatialLoaded(connection);

    expect(query).toHaveBeenCalledTimes(2);
  });

  test("concurrent callers share the same in-flight promise", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const connection = { query };

    await Promise.all([
      ensureSpatialLoaded(connection),
      ensureSpatialLoaded(connection),
      ensureSpatialLoaded(connection),
    ]);

    expect(query).toHaveBeenCalledTimes(2);
  });

  test("tracks loaded state per connection", async () => {
    const queryA = vi.fn().mockResolvedValue(undefined);
    const queryB = vi.fn().mockResolvedValue(undefined);
    const connA = { query: queryA };
    const connB = { query: queryB };

    await ensureSpatialLoaded(connA);
    await ensureSpatialLoaded(connB);

    expect(queryA).toHaveBeenCalledTimes(2);
    expect(queryB).toHaveBeenCalledTimes(2);
  });

  test("retries after a rejection instead of caching the failure", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient network"))
      .mockResolvedValue(undefined);
    const connection = { query };

    await expect(ensureSpatialLoaded(connection)).rejects.toThrow("transient network");

    // Second call must re-issue INSTALL/LOAD rather than re-await the
    // rejected promise from the first call.
    await expect(ensureSpatialLoaded(connection)).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenNthCalledWith(1, "INSTALL spatial;");
    expect(query).toHaveBeenNthCalledWith(2, "INSTALL spatial;");
    expect(query).toHaveBeenNthCalledWith(3, "LOAD spatial;");
  });
});
