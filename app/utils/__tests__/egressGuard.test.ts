import { describe, expect, test } from "vitest";

import { isProbingAllowedEndpoint, isPubliclyReachableUrl } from "~/utils/egressGuard";

describe("isPubliclyReachableUrl", () => {
  test("admits public IPv4 and DNS hosts", () => {
    expect(isPubliclyReachableUrl("https://8.8.8.8")).toBe(true);
    expect(isPubliclyReachableUrl("https://52.94.236.248")).toBe(true);
    expect(isPubliclyReachableUrl("https://s3.eu-central-1.amazonaws.com")).toBe(true);
    expect(isPubliclyReachableUrl("https://minio.customer.example.com")).toBe(true);
  });

  test("rejects private, loopback, link-local, CGNAT, and metadata IPv4 hosts", () => {
    for (const url of [
      "https://10.0.0.5",
      "https://127.0.0.1",
      "https://0.0.0.0",
      "https://169.254.169.254",
      "https://192.168.1.1",
      "https://172.16.0.1",
      "https://100.64.1.1",
    ]) {
      expect(isPubliclyReachableUrl(url)).toBe(false);
    }
  });

  test("rejects integer-spelled loopback (URL parser normalizes to 127.0.0.1)", () => {
    expect(isPubliclyReachableUrl("https://2130706433")).toBe(false);
  });

  test("rejects private IPv6 spellings", () => {
    for (const url of ["https://[::1]", "https://[::]", "https://[fe80::1]", "https://[fc00::1]"]) {
      expect(isPubliclyReachableUrl(url)).toBe(false);
    }
  });

  test("rejects IPv4-mapped and IPv4-compatible private spellings", () => {
    expect(isPubliclyReachableUrl("https://[::ffff:127.0.0.1]")).toBe(false);
    expect(isPubliclyReachableUrl("https://[::ffff:10.0.0.1]")).toBe(false);
    expect(isPubliclyReachableUrl("https://[::10.0.0.1]")).toBe(false);
  });

  test("admits a public IPv6 address", () => {
    expect(isPubliclyReachableUrl("https://[2606:4700::6810:84e4]")).toBe(true);
  });

  test("rejects an unparseable URL", () => {
    expect(isPubliclyReachableUrl("not a url")).toBe(false);
  });
});

describe("isProbingAllowedEndpoint", () => {
  test("admits https on a publicly reachable host", () => {
    expect(isProbingAllowedEndpoint("https://s3.example.com")).toBe(true);
  });

  test("rejects https on a private host", () => {
    expect(isProbingAllowedEndpoint("https://10.0.0.5")).toBe(false);
  });

  test("admits loopback http only in local environments", () => {
    expect(isProbingAllowedEndpoint("http://localhost:9000", { NODE_ENV: "test" })).toBe(true);
    expect(isProbingAllowedEndpoint("http://localhost:9000", { NODE_ENV: "development" })).toBe(
      true,
    );
    expect(isProbingAllowedEndpoint("http://localhost:9000", { NODE_ENV: "production" })).toBe(
      false,
    );
    expect(isProbingAllowedEndpoint("http://localhost:9000", {})).toBe(false);
  });

  test("rejects plain http on a non-loopback host even locally", () => {
    expect(
      isProbingAllowedEndpoint("http://minio.intranet.example.com", { NODE_ENV: "test" }),
    ).toBe(false);
  });
});
