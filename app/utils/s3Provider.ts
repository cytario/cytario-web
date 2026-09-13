/**
 * Centralizes logic for detecting whether an endpoint is AWS S3 or
 * an S3-compatible service (RustFS, Cloudflare R2, Wasabi, etc.)
 */

import type { ProviderType } from "~/utils/providerCatalog.schema";

export interface S3ProviderConfig {
  isAwsS3: boolean;
  usePathStyle: boolean;
  stsEndpoint: string;
  s3Endpoint: string;
  /**
   * Whether the provider's STS honors the inline session `Policy` parameter
   * (applied as a filter over the session's entitlement). AWS S3 and RustFS
   * both do; the legacy MinIO path did not.
   */
  honorsInlineSessionPolicy: boolean;
}

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_ENDPOINT = "https://s3.amazonaws.com";

/** True if the endpoint is AWS S3 (or absent, the AWS default). */
export function isAwsS3Endpoint(endpoint?: string | null): boolean {
  return !endpoint || endpoint.includes("amazonaws.com");
}

/**
 * Gets the full provider configuration based on provider type, endpoint, and
 * region. The provider type is authoritative when known; the endpoint hostname
 * heuristic only serves catalogs that predate typed providers (all-AWS).
 * @param endpoint - The S3 endpoint URL (or null/undefined for AWS default)
 * @param region - The AWS region (defaults to 'eu-central-1')
 * @param providerType - The catalog's provider type; `undefined` falls back to
 *   the endpoint heuristic (an AWS connection with no endpoint).
 */
export function getS3ProviderConfig(
  endpoint?: string | null,
  region?: string | null,
  providerType?: ProviderType | null,
): S3ProviderConfig {
  const actualRegion = region ?? DEFAULT_REGION;
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  const isAwsS3 = providerType ? providerType === "aws" : isAwsS3Endpoint(endpoint);

  return {
    isAwsS3,
    usePathStyle: !isAwsS3,
    stsEndpoint: isAwsS3 ? `https://sts.${actualRegion}.amazonaws.com` : actualEndpoint,
    s3Endpoint: isAwsS3 ? `https://s3.${actualRegion}.amazonaws.com` : actualEndpoint,
    honorsInlineSessionPolicy: isAwsS3 || providerType === "rustfs",
  };
}

/** True if the endpoint uses SSL. */
export function shouldUseSSL(endpoint?: string | null): boolean {
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  return actualEndpoint.startsWith("https://");
}

/** Hostname from the endpoint URL (strips protocol). */
export function getEndpointHostname(endpoint?: string | null): string {
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  return new URL(actualEndpoint).host;
}
