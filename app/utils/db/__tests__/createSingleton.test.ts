import { createSingleton } from "../createSingleton";

describe("createSingleton", () => {
  test("returns cached value for same key", async () => {
    const initFn = vi.fn(async (key: string) => `value-${key}`);
    const singleton = createSingleton(initFn);

    const result1 = await singleton("key1");
    const result2 = await singleton("key1");

    expect(result1).toBe("value-key1");
    expect(result2).toBe("value-key1");
    expect(initFn).toHaveBeenCalledTimes(1);
  });

  test("calls initFn separately for different keys", async () => {
    const initFn = vi.fn(async (key: string) => `value-${key}`);
    const singleton = createSingleton(initFn);

    const result1 = await singleton("key1");
    const result2 = await singleton("key2");

    expect(result1).toBe("value-key1");
    expect(result2).toBe("value-key2");
    expect(initFn).toHaveBeenCalledTimes(2);
    expect(initFn).toHaveBeenCalledWith("key1");
    expect(initFn).toHaveBeenCalledWith("key2");
  });

  test("removes from cache on error, allowing retry", async () => {
    let callCount = 0;
    const initFn = vi.fn(async (key: string) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("First call fails");
      }
      return `value-${key}`;
    });
    const singleton = createSingleton(initFn);

    // First call should fail
    await expect(singleton("key1")).rejects.toThrow("First call fails");

    // Second call should succeed (retry works because cache was cleared)
    const result = await singleton("key1");
    expect(result).toBe("value-key1");
    expect(initFn).toHaveBeenCalledTimes(2);
  });

  test("passes additional arguments to initFn", async () => {
    const initFn = vi.fn(
      async (key: string, multiplier: number, prefix: string) =>
        `${prefix}-${key}-${multiplier}`
    );
    const singleton = createSingleton(initFn);

    const result = await singleton("key1", 5, "test");

    expect(result).toBe("test-key1-5");
    expect(initFn).toHaveBeenCalledWith("key1", 5, "test");
  });

  test("handles concurrent calls with same key", async () => {
    let resolvePromise: (value: string) => void;
    const initFn = vi.fn(
      async () =>
        new Promise<string>((resolve) => {
          resolvePromise = resolve;
        })
    );
    const singleton = createSingleton(initFn);

    // Start two concurrent calls
    const promise1 = singleton("key1");
    const promise2 = singleton("key1");

    // Resolve the single underlying promise
    resolvePromise!("value-key1");

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe("value-key1");
    expect(result2).toBe("value-key1");
    expect(initFn).toHaveBeenCalledTimes(1);
  });

  test("caches by first parameter only (key)", async () => {
    const initFn = vi.fn(async (key: string, arg: number) => `${key}-${arg}`);
    const singleton = createSingleton(initFn);

    const result1 = await singleton("key1", 1);
    // Same key but different arg - should return cached value
    const result2 = await singleton("key1", 2);

    expect(result1).toBe("key1-1");
    expect(result2).toBe("key1-1"); // Returns cached, not "key1-2"
    expect(initFn).toHaveBeenCalledTimes(1);
  });

  test("works with object keys", async () => {
    const key1 = { id: 1 };
    const key2 = { id: 1 }; // Different reference, same content
    const initFn = vi.fn(async (key: { id: number }) => `value-${key.id}`);
    const singleton = createSingleton(initFn);

    const result1 = await singleton(key1);
    const result2 = await singleton(key1); // Same reference
    const result3 = await singleton(key2); // Different reference

    expect(result1).toBe("value-1");
    expect(result2).toBe("value-1");
    expect(result3).toBe("value-1");
    // Called twice: once for key1 reference, once for key2 reference
    expect(initFn).toHaveBeenCalledTimes(2);
  });

  test("preserves error type when rethrowing", async () => {
    class CustomError extends Error {
      constructor(public code: number) {
        super("Custom error");
        this.name = "CustomError";
      }
    }

    const initFn = vi.fn(async () => {
      throw new CustomError(500);
    });
    const singleton = createSingleton(initFn);

    try {
      await singleton("key1");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      expect((error as CustomError).code).toBe(500);
    }
  });
});
