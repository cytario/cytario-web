import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { DEFAULT_S3_HOSTS, getAllowedS3Hosts, isAllowedS3Host } from "~/utils/s3HostAllowlist";

describe("DEFAULT_S3_HOSTS", () => {
  test("includes the canonical AWS S3 endpoint family", () => {
    expect(DEFAULT_S3_HOSTS).toContain("https://*.amazonaws.com");
  });

  test("includes the cytario-hosted storage family", () => {
    expect(DEFAULT_S3_HOSTS).toContain("https://*.cytario.com");
  });
});

describe("getAllowedS3Hosts", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  test("returns the defaults when CYTARIO_ALLOWED_S3_HOSTS is unset", () => {
    expect(getAllowedS3Hosts({})).toEqual(DEFAULT_S3_HOSTS);
  });

  test("returns the defaults when CYTARIO_ALLOWED_S3_HOSTS is empty/whitespace", () => {
    expect(getAllowedS3Hosts({ CYTARIO_ALLOWED_S3_HOSTS: "   " })).toEqual(DEFAULT_S3_HOSTS);
  });

  test("env value REPLACES the defaults (override, not extend)", () => {
    // Operator opts out of AWS + cytario by specifying only their own
    // MinIO host. Defaults must drop out so the deployer keeps full
    // control of the allowlist.
    const hosts = getAllowedS3Hosts({
      CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com,https://storage.acme.dev",
    });
    expect(hosts).toEqual(["https://minio.example.com", "https://storage.acme.dev"]);
    expect(hosts).not.toContain("https://*.amazonaws.com");
    expect(hosts).not.toContain("https://*.cytario.com");
  });

  test("accepts subdomain wildcards (`*.host`)", () => {
    const hosts = getAllowedS3Hosts({
      CYTARIO_ALLOWED_S3_HOSTS: "https://*.minio.example.com",
    });
    expect(hosts).toEqual(["https://*.minio.example.com"]);
  });

  test("accepts entries with an explicit port", () => {
    const hosts = getAllowedS3Hosts({
      CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com:9000",
    });
    expect(hosts).toEqual(["https://minio.example.com:9000"]);
  });

  test("drops malformed entries with a console.warn", () => {
    const hosts = getAllowedS3Hosts({
      // Each entry is malformed for a different reason: missing scheme,
      // http scheme, path component, mid-host wildcard.
      CYTARIO_ALLOWED_S3_HOSTS: [
        "minio.example.com",
        "http://minio.example.com",
        "https://minio.example.com/buckets",
        "https://min*.example.com",
      ].join(","),
    });
    // Env explicitly set → override mode. All entries malformed →
    // empty allowlist (deny-by-default). Defaults are NOT reinstated
    // because the operator clearly intended to override them.
    expect(hosts).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(4);
  });

  test("ignores blank entries from trailing commas", () => {
    const hosts = getAllowedS3Hosts({
      CYTARIO_ALLOWED_S3_HOSTS: ",https://minio.cytario.com , ,",
    });
    expect(hosts).toEqual(["https://minio.cytario.com"]);
  });

  test("deployer can include the defaults explicitly to keep them alongside extras", () => {
    const hosts = getAllowedS3Hosts({
      CYTARIO_ALLOWED_S3_HOSTS:
        "https://*.amazonaws.com,https://*.cytario.com,https://minio.example.com",
    });
    expect(hosts).toEqual([
      "https://*.amazonaws.com",
      "https://*.cytario.com",
      "https://minio.example.com",
    ]);
  });
});

describe("isAllowedS3Host", () => {
  test("accepts a host matching a subdomain wildcard in the defaults", () => {
    expect(isAllowedS3Host("https://my-bucket.s3.eu-central-1.amazonaws.com", {})).toBe(true);
    expect(isAllowedS3Host("https://storage.cytario.com", {})).toBe(true);
  });

  test("rejects an http:// URL even if the host would match a wildcard", () => {
    expect(isAllowedS3Host("http://my-bucket.s3.amazonaws.com", {})).toBe(false);
  });

  test("rejects AWS instance metadata service (SSRF)", () => {
    expect(isAllowedS3Host("https://169.254.169.254/latest/meta-data/", {})).toBe(false);
  });

  test("rejects RFC1918 / loopback / link-local hosts", () => {
    for (const url of [
      "https://10.0.0.1",
      "https://192.168.1.1",
      "https://172.16.5.5",
      "https://127.0.0.1",
      "https://localhost",
    ]) {
      expect(isAllowedS3Host(url, {})).toBe(false);
    }
  });

  test("wildcard `*.cytario.com` does not match the bare parent `cytario.com`", () => {
    // Subdomain wildcards must NOT match the parent — same rule used
    // by browser CORS / cookie code.
    expect(isAllowedS3Host("https://cytario.com", {})).toBe(false);
  });

  test("accepts a CYTARIO_ALLOWED_S3_HOSTS entry", () => {
    expect(
      isAllowedS3Host("https://minio.example.com", {
        CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com",
      }),
    ).toBe(true);
  });

  test("respects port mismatches when an allowlist entry pins a port", () => {
    expect(
      isAllowedS3Host("https://minio.example.com:9001", {
        CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com:9000",
      }),
    ).toBe(false);
    expect(
      isAllowedS3Host("https://minio.example.com:9000", {
        CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com:9000",
      }),
    ).toBe(true);
  });

  test("accepts any port when the allowlist entry omits one", () => {
    expect(
      isAllowedS3Host("https://minio.example.com:9000", {
        CYTARIO_ALLOWED_S3_HOSTS: "https://minio.example.com",
      }),
    ).toBe(true);
  });

  test("rejects an unparseable URL", () => {
    expect(isAllowedS3Host("not a url", {})).toBe(false);
    expect(isAllowedS3Host("", {})).toBe(false);
  });
});
