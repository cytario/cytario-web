/**
 * S3 Provider Detection Utilities
 *
 * Centralizes logic for detecting whether an endpoint is AWS S3 or
 * an S3-compatible service (MinIO, Cloudflare R2, Wasabi, etc.)
 */

export interface S3ProviderConfig {
  isAwsS3: boolean;
  usePathStyle: boolean;
  stsEndpoint: string;
  s3Endpoint: string;
}

const DEFAULT_REGION = "eu-central-1";
const DEFAULT_ENDPOINT = "https://s3.amazonaws.com";

/**
 * Determines if an endpoint is AWS S3 or S3-compatible service
 * @param endpoint - The S3 endpoint URL (or null/undefined for AWS default)
 * @returns True if AWS S3, false if S3-compatible service
 */
export function isAwsS3Endpoint(endpoint?: string | null): boolean {
  return !endpoint || endpoint.includes("amazonaws.com");
}

/**
 * Gets the full provider configuration based on endpoint and region
 * @param endpoint - The S3 endpoint URL (or null/undefined for AWS default)
 * @param region - The AWS region (defaults to 'eu-central-1')
 * @returns Complete provider configuration
 */
export function getS3ProviderConfig(
  endpoint?: string | null,
  region?: string | null
): S3ProviderConfig {
  const actualRegion = region ?? DEFAULT_REGION;
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  const isAwsS3 = isAwsS3Endpoint(endpoint);

  return {
    isAwsS3,
    usePathStyle: !isAwsS3,
    stsEndpoint: isAwsS3
      ? `https://sts.${actualRegion}.amazonaws.com`
      : actualEndpoint,
    s3Endpoint: isAwsS3
      ? `https://s3.${actualRegion}.amazonaws.com`
      : actualEndpoint,
  };
}

/**
 * Gets the DuckDB URL style setting based on provider
 * @param endpoint - The S3 endpoint URL
 * @returns 'vhost' for AWS S3, 'path' for S3-compatible services
 */
export function getDuckDbUrlStyle(
  endpoint?: string | null
): "vhost" | "path" {
  return isAwsS3Endpoint(endpoint) ? "vhost" : "path";
}

/**
 * Determines if SSL should be used based on endpoint
 * @param endpoint - The S3 endpoint URL
 * @returns True if endpoint starts with https://
 */
export function shouldUseSSL(endpoint?: string | null): boolean {
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  return actualEndpoint.startsWith("https://");
}

/**
 * Extracts hostname from endpoint URL (strips protocol)
 * @param endpoint - The S3 endpoint URL
 * @returns Hostname without protocol
 */
export function getEndpointHostname(endpoint?: string | null): string {
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  return new URL(actualEndpoint).host;
}
