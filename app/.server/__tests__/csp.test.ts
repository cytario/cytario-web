import { describe, expect, test } from "vitest";

import { buildContentSecurityPolicy } from "~/.server/csp";

describe("buildContentSecurityPolicy", () => {
  test("connect-src carries the per-request org hosts alongside 'self'", () => {
    const policy = buildContentSecurityPolicy({}, [
      "https://s3.eu-central-1.amazonaws.com",
      "https://minio.customer.example.com",
    ]);
    expect(policy).toContain(
      "connect-src 'self' https://s3.eu-central-1.amazonaws.com https://minio.customer.example.com",
    );
  });

  test("fails closed to 'self' only when no hosts resolve", () => {
    const policy = buildContentSecurityPolicy({}, []);
    expect(policy).toContain("connect-src 'self'");
    expect(policy).not.toMatch(/connect-src[^;]*https?:/);
  });

  test("an arbitrary customer host is admitted with no environment configuration", () => {
    const policy = buildContentSecurityPolicy({}, ["https://storage.never-seen.example.org"]);
    expect(policy).toContain("https://storage.never-seen.example.org");
  });

  test("dev-only carve-out admits local http hosts in a local env", () => {
    const policy = buildContentSecurityPolicy(
      {
        NODE_ENV: "development",
        CYTARIO_DEV_CONNECT_HOSTS: "http://localhost:9000,http://localhost:8081",
      },
      ["https://s3.eu-central-1.amazonaws.com"],
    );
    expect(policy).toContain(
      "connect-src 'self' https://s3.eu-central-1.amazonaws.com http://localhost:9000 http://localhost:8081",
    );
  });

  test("dev carve-out is suppressed in production", () => {
    const policy = buildContentSecurityPolicy(
      {
        NODE_ENV: "production",
        CYTARIO_DEV_CONNECT_HOSTS: "http://localhost:9000",
      },
      ["https://s3.eu-central-1.amazonaws.com"],
    );
    expect(policy).not.toContain("http://localhost:9000");
    expect(policy).toContain("connect-src 'self' https://s3.eu-central-1.amazonaws.com");
  });

  test("dev carve-out is suppressed in staging", () => {
    const policy = buildContentSecurityPolicy(
      {
        NODE_ENV: "staging",
        CYTARIO_DEV_CONNECT_HOSTS: "http://localhost:9000",
      },
      [],
    );
    expect(policy).not.toContain("http://localhost:9000");
  });

  test("keeps every non-connect-src directive — the clickjacking and injection guards", () => {
    const policy = buildContentSecurityPolicy({}, ["https://s3.eu-central-1.amazonaws.com"]);
    expect(policy).toContain("default-src 'self'");
    // RR streams an inline hydration script — without `'unsafe-inline'`
    // hydration breaks. `'wasm-unsafe-eval'` covers the locally-bundled
    // DuckDB WASM module. Both carve-outs are documented in `csp.ts`.
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).toContain("font-src 'self' data:");
    // DuckDB WASM worker spawns a same-origin script and uses `blob:`
    // URLs internally for in-worker file buffers.
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  test("emits base-uri, form-action, and object-src to block injection bypasses", () => {
    const policy = buildContentSecurityPolicy({}, []);
    // `<base href="https://evil/">` would otherwise redirect every
    // relative URL on the hydrated document, bypassing `'unsafe-inline'`.
    expect(policy).toContain("base-uri 'self'");
    // `<form action="https://evil/">` would otherwise exfiltrate POSTs.
    expect(policy).toContain("form-action 'self'");
    // Plugin / Flash surface is dead — keep it locked.
    expect(policy).toContain("object-src 'none'");
  });
});
