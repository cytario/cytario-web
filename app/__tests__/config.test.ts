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
