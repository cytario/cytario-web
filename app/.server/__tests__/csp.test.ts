import { describe, expect, test } from "vitest";

import { buildContentSecurityPolicy, getAllowedS3Hosts } from "~/.server/csp";

describe("buildContentSecurityPolicy", () => {
  test("defaults the connect-src to self + the AWS S3 endpoint family + cytario-hosted storage", () => {
    const policy = buildContentSecurityPolicy({});
    expect(policy).toContain("connect-src 'self' https://*.amazonaws.com https://*.cytario.com");
  });

  test("CYTARIO_ALLOWED_S3_HOSTS replaces the defaults entirely (override semantics)", () => {
    // Set env → defaults drop out so a deployer can run AWS-free or
    // cytario-free if they want to. The CSP connect-src reflects only
    // the operator's choice.
    const policy = buildContentSecurityPolicy({
      CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com,https://storage.acme.dev",
    });

    expect(policy).toContain(
      "connect-src 'self' https://minio.example.com https://storage.acme.dev",
    );
    expect(policy).not.toMatch(/https:\/\/\*\.amazonaws\.com/);
    expect(policy).not.toMatch(/https:\/\/\*\.cytario\.com/);
  });

  test("ignores blank entries in CYTARIO_ALLOWED_S3_HOSTS so trailing commas do not break the policy", () => {
    const hosts = getAllowedS3Hosts({
      CYTARIO_ALLOWED_S3_HOSTS: ",https://minio.example.com , ,",
    });
    expect(hosts).toEqual(["https://minio.example.com"]);
  });

  test("includes the documented carve-outs and clickjacking guard", () => {
    const policy = buildContentSecurityPolicy({});
    expect(policy).toContain("default-src 'self'");
    // RR streams an inline hydration script — without `'unsafe-inline'`
    // hydration breaks. `'wasm-unsafe-eval'` covers the locally-bundled
    // DuckDB WASM module. Both carve-outs are documented in `csp.ts`.
    expect(policy).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'");
    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("font-src 'self' data:");
    // DuckDB WASM worker spawns a same-origin script and uses `blob:`
    // URLs internally for in-worker file buffers.
    expect(policy).toContain("worker-src 'self' blob:");
    expect(policy).toContain("frame-ancestors 'none'");
  });

  test("tightens img-src to self + data + blob", () => {
    // The previous policy allowed `https:` wildcard which is wider than
    // any current use case justifies.
    const policy = buildContentSecurityPolicy({});
    expect(policy).toContain("img-src 'self' data: blob:");
    expect(policy).not.toMatch(/img-src[^;]*\bhttps:/);
  });

  test("emits base-uri, form-action, and object-src to block injection bypasses", () => {
    const policy = buildContentSecurityPolicy({});
    // `<base href="https://evil/">` would otherwise redirect every
    // relative URL on the hydrated document, bypassing `'unsafe-inline'`.
    expect(policy).toContain("base-uri 'self'");
    // `<form action="https://evil/">` would otherwise exfiltrate POSTs.
    expect(policy).toContain("form-action 'self'");
    // Plugin / Flash surface is dead — keep it locked.
    expect(policy).toContain("object-src 'none'");
  });
});
