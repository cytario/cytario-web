import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const KEY_BYTES = 32;

async function loadModule(key: string | undefined) {
  vi.resetModules();
  // `cytarioConfig` reads the environment once at module load, so the fake
  // config must be re-registered for every reset too.
  vi.doMock("~/config", () => ({ cytarioConfig: { dbEncryptionKey: key } }));
  return import("../crypto");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("~/config");
  vi.resetModules();
});

describe("secret encryption (SRS-CY-416110, SRS-CY-52218)", () => {
  test("round-trips a secret through an authenticated cipher", async () => {
    const { encryptSecret, decryptSecret } = await loadModule(
      Buffer.alloc(KEY_BYTES, 7).toString("base64"),
    );

    const ciphertext = await encryptSecret("batch-refresh-token");

    expect(ciphertext).not.toContain("batch-refresh-token");
    await expect(decryptSecret(ciphertext)).resolves.toBe("batch-refresh-token");
  });

  test("a fresh IV per call: the same plaintext yields a different blob", async () => {
    const { encryptSecret } = await loadModule(Buffer.alloc(KEY_BYTES, 7).toString("base64"));

    const first = await encryptSecret("same-plaintext");
    const second = await encryptSecret("same-plaintext");

    expect(first).not.toBe(second);
  });

  test("a truncated blob fails to decrypt rather than returning garbage", async () => {
    const { encryptSecret, decryptSecret } = await loadModule(
      Buffer.alloc(KEY_BYTES, 7).toString("base64"),
    );

    const ciphertext = await encryptSecret("batch-refresh-token");
    const truncated = Buffer.from(ciphertext, "base64").subarray(0, 20).toString("base64");

    await expect(decryptSecret(truncated)).rejects.toThrow();
  });

  test("a tampered blob fails the auth tag", async () => {
    const { encryptSecret, decryptSecret } = await loadModule(
      Buffer.alloc(KEY_BYTES, 7).toString("base64"),
    );

    const blob = Buffer.from(await encryptSecret("batch-refresh-token"), "base64");
    blob[blob.length - 1] ^= 0xff;

    await expect(decryptSecret(blob.toString("base64"))).rejects.toThrow();
  });

  test("a different key cannot read the blob", async () => {
    const { encryptSecret } = await loadModule(Buffer.alloc(KEY_BYTES, 7).toString("base64"));
    const ciphertext = await encryptSecret("batch-refresh-token");

    const { decryptSecret } = await loadModule(Buffer.alloc(KEY_BYTES, 9).toString("base64"));

    await expect(decryptSecret(ciphertext)).rejects.toThrow();
  });

  test("an unset key fails closed in production", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const { encryptSecret } = await loadModule(undefined);

    await expect(encryptSecret("batch-refresh-token")).rejects.toThrow(/DB_ENCRYPTION_KEY/);

    process.env.NODE_ENV = previous;
  });

  test("an unset key fails closed when NODE_ENV is not set at all", async () => {
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    const { encryptSecret } = await loadModule(undefined);

    // A deployment that forgot NODE_ENV must not silently store a refresh token
    // in the clear.
    await expect(encryptSecret("batch-refresh-token")).rejects.toThrow(/DB_ENCRYPTION_KEY/);

    process.env.NODE_ENV = previous;
  });

  test("an unset key fails closed in any non-local environment", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "staging";
    const { encryptSecret } = await loadModule(undefined);

    await expect(encryptSecret("batch-refresh-token")).rejects.toThrow(/DB_ENCRYPTION_KEY/);

    process.env.NODE_ENV = previous;
  });
  test("an unset key in development degrades to plaintext so a checkout stays runnable", async () => {
    const { encryptSecret, decryptSecret } = await loadModule(undefined);

    await expect(encryptSecret("batch-refresh-token")).resolves.toBe("batch-refresh-token");
    await expect(decryptSecret("batch-refresh-token")).resolves.toBe("batch-refresh-token");
  });
});
