import { afterEach, describe, expect, test, vi } from "vitest";

import { cytarioConfig } from "~/config";

describe("session cookie", () => {
  // Shared Keycloak realm: cytario-web (app.cytario.com) and the admin portal
  // (admin.cytario.com) are distinct origins. A `Domain=.cytario.com` cookie
  // would leak the session across them. The cookie must stay host-scoped, so
  // there must be no `Domain` attribute.
  test("has no Domain attribute (host-scoped, no cross-subdomain leak)", () => {
    expect("domain" in cytarioConfig.cookie).toBe(false);
    expect((cytarioConfig.cookie as { domain?: unknown }).domain).toBeUndefined();
  });
});

describe("provider catalog failure backoff", () => {
  // config.ts reads process.env once at import time, so each case re-imports
  // the module with a stubbed env.
  const importConfig = async () =>
    (await vi.importActual<typeof import("~/config")>("~/config")).cytarioConfig;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("defaults to 5s when CATALOG_FAILURE_BACKOFF_MS is unset", async () => {
    vi.stubEnv("CATALOG_FAILURE_BACKOFF_MS", "");
    expect((await importConfig()).providers.catalogFailureBackoffMs).toBe(5_000);
  });

  test("0 disables the backoff (an explicit zero must not fall back to the default)", async () => {
    vi.stubEnv("CATALOG_FAILURE_BACKOFF_MS", "0");
    expect((await importConfig()).providers.catalogFailureBackoffMs).toBe(0);
  });

  test("honours a custom value", async () => {
    vi.stubEnv("CATALOG_FAILURE_BACKOFF_MS", "10000");
    expect((await importConfig()).providers.catalogFailureBackoffMs).toBe(10_000);
  });
});

describe("built-in public provider config", () => {
  const importConfig = async () =>
    (await vi.importActual<typeof import("~/config")>("~/config")).cytarioConfig;

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  test("defaults to the public AWS S3 endpoint and us-east-1", async () => {
    expect(await importConfig()).toMatchObject({
      providers: {
        builtinPublicProvider: {
          endpoint: "https://s3.us-east-1.amazonaws.com",
          region: "us-east-1",
        },
      },
    });
  });

  test("honours endpoint and region overrides", async () => {
    vi.stubEnv("CYTARIO_PUBLIC_PROVIDER_ENDPOINT", "https://s3.mirror.example.com");
    vi.stubEnv("CYTARIO_PUBLIC_PROVIDER_REGION", "eu-west-1");
    expect(await importConfig()).toMatchObject({
      providers: {
        builtinPublicProvider: {
          endpoint: "https://s3.mirror.example.com",
          region: "eu-west-1",
        },
      },
    });
  });

  test("an empty endpoint opts out (null disables the built-in)", async () => {
    vi.stubEnv("CYTARIO_PUBLIC_PROVIDER_ENDPOINT", "");
    expect((await importConfig()).providers.builtinPublicProvider.endpoint).toBeNull();
  });

  test("refuses to boot on a non-https endpoint", async () => {
    vi.stubEnv("CYTARIO_PUBLIC_PROVIDER_ENDPOINT", "ftp://mirror.example.com");
    await expect(importConfig()).rejects.toThrow(/CYTARIO_PUBLIC_PROVIDER_ENDPOINT/);
  });

  test("refuses to boot on an unparseable endpoint", async () => {
    vi.stubEnv("CYTARIO_PUBLIC_PROVIDER_ENDPOINT", "://not a url");
    await expect(importConfig()).rejects.toThrow(/CYTARIO_PUBLIC_PROVIDER_ENDPOINT/);
  });

  test("loopback http is allowed only in a local environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CYTARIO_PUBLIC_PROVIDER_ENDPOINT", "http://localhost:9000");
    await expect(importConfig()).rejects.toThrow(/CYTARIO_PUBLIC_PROVIDER_ENDPOINT/);

    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    expect((await importConfig()).providers.builtinPublicProvider.endpoint).toBe(
      "http://localhost:9000",
    );
  });
});
