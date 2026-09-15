import { describe, it, expect } from "vitest";

import {
  isAwsS3Endpoint,
  getS3ProviderConfig,
  shouldUseSSL,
  getEndpointHostname,
} from "./s3Provider";

describe("s3Provider utilities", () => {
  describe("isAwsS3Endpoint", () => {
    it("returns true for undefined endpoint (AWS default)", () => {
      expect(isAwsS3Endpoint(undefined)).toBe(true);
    });

    it("returns true for null endpoint (AWS default)", () => {
      expect(isAwsS3Endpoint(null)).toBe(true);
    });

    it("returns true for AWS S3 endpoints", () => {
      expect(isAwsS3Endpoint("https://s3.amazonaws.com")).toBe(true);
      expect(isAwsS3Endpoint("https://s3.eu-central-1.amazonaws.com")).toBe(true);
      expect(isAwsS3Endpoint("https://bucket.s3.amazonaws.com")).toBe(true);
    });

    it("returns false for S3-compatible endpoints", () => {
      expect(isAwsS3Endpoint("https://s3.cytar.io")).toBe(false);
      expect(isAwsS3Endpoint("http://localhost:9000")).toBe(false);
      expect(isAwsS3Endpoint("https://storage.googleapis.com")).toBe(false);
      expect(isAwsS3Endpoint("https://s3.wasabisys.com")).toBe(false);
    });
  });

  describe("getS3ProviderConfig", () => {
    it("returns AWS config for undefined endpoint", () => {
      const config = getS3ProviderConfig(undefined, "eu-central-1");
      expect(config.isAwsS3).toBe(true);
      expect(config.usePathStyle).toBe(false);
      expect(config.stsEndpoint).toBe("https://sts.eu-central-1.amazonaws.com");
      expect(config.s3Endpoint).toBe("https://s3.eu-central-1.amazonaws.com");
    });

    it("returns AWS config for null endpoint", () => {
      const config = getS3ProviderConfig(null, "us-east-1");
      expect(config.isAwsS3).toBe(true);
      expect(config.usePathStyle).toBe(false);
      expect(config.stsEndpoint).toBe("https://sts.us-east-1.amazonaws.com");
      expect(config.s3Endpoint).toBe("https://s3.us-east-1.amazonaws.com");
    });

    it("uses default region when region is null", () => {
      const config = getS3ProviderConfig(null, null);
      expect(config.stsEndpoint).toBe("https://sts.eu-central-1.amazonaws.com");
      expect(config.s3Endpoint).toBe("https://s3.eu-central-1.amazonaws.com");
    });

    it("returns S3-compatible config for custom endpoint", () => {
      const config = getS3ProviderConfig("https://s3.cytar.io", "eu-central-1");
      expect(config.isAwsS3).toBe(false);
      expect(config.usePathStyle).toBe(true);
      expect(config.stsEndpoint).toBe("https://s3.cytar.io");
      expect(config.s3Endpoint).toBe("https://s3.cytar.io");
    });

    it("returns S3-compatible config for MinIO", () => {
      const config = getS3ProviderConfig("http://localhost:9000", null);
      expect(config.isAwsS3).toBe(false);
      expect(config.usePathStyle).toBe(true);
      expect(config.stsEndpoint).toBe("http://localhost:9000");
      expect(config.s3Endpoint).toBe("http://localhost:9000");
    });

    it("returns AWS config when providerType is aws even with a non-AWS-looking endpoint", () => {
      const config = getS3ProviderConfig("https://s3.cytar.io", "eu-central-1", "aws");
      expect(config.isAwsS3).toBe(true);
      expect(config.usePathStyle).toBe(false);
      expect(config.honorsInlineSessionPolicy).toBe(true);
    });

    it("returns RustFS config: path style, STS on endpoint, inline policy honored", () => {
      const config = getS3ProviderConfig("https://rustfs-poc.cytar.io", "eu-central-1", "rustfs");
      expect(config.isAwsS3).toBe(false);
      expect(config.usePathStyle).toBe(true);
      expect(config.stsEndpoint).toBe("https://rustfs-poc.cytar.io");
      expect(config.s3Endpoint).toBe("https://rustfs-poc.cytar.io");
      expect(config.honorsInlineSessionPolicy).toBe(true);
    });

    it("omits the inline session policy for an untyped non-AWS endpoint (heuristic fallback)", () => {
      // A caller that resolves no provider type (pre-dating typed catalogs):
      // the hostname heuristic classifies the endpoint as S3-compatible and the
      // mint stays safe — no inline policy is attached to a provider that may
      // ignore or reject the parameter.
      const config = getS3ProviderConfig("https://minio.internal:9000", null, undefined);
      expect(config.isAwsS3).toBe(false);
      expect(config.honorsInlineSessionPolicy).toBe(false);
    });
  });

  describe("shouldUseSSL", () => {
    it("returns true for https endpoints", () => {
      expect(shouldUseSSL("https://s3.amazonaws.com")).toBe(true);
      expect(shouldUseSSL("https://s3.cytar.io")).toBe(true);
      expect(shouldUseSSL(undefined)).toBe(true); // default is https
      expect(shouldUseSSL(null)).toBe(true); // default is https
    });

    it("returns false for http endpoints", () => {
      expect(shouldUseSSL("http://localhost:9000")).toBe(false);
      expect(shouldUseSSL("http://minio.local:9000")).toBe(false);
    });
  });

  describe("getEndpointHostname", () => {
    it("extracts hostname from AWS default", () => {
      expect(getEndpointHostname(undefined)).toBe("s3.amazonaws.com");
      expect(getEndpointHostname(null)).toBe("s3.amazonaws.com");
    });

    it("extracts hostname from custom endpoint", () => {
      expect(getEndpointHostname("https://s3.cytar.io")).toBe("s3.cytar.io");
      expect(getEndpointHostname("http://localhost:9000")).toBe("localhost:9000");
      expect(getEndpointHostname("https://s3.eu-central-1.amazonaws.com")).toBe(
        "s3.eu-central-1.amazonaws.com",
      );
    });

    it("includes port in hostname when present", () => {
      expect(getEndpointHostname("http://minio.local:9000")).toBe("minio.local:9000");
    });
  });
});
