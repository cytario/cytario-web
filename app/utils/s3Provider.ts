/**
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

/** True if the endpoint is AWS S3 (or absent, the AWS default). */
export function isAwsS3Endpoint(endpoint?: string | null): boolean {
  return !endpoint || endpoint.includes("amazonaws.com");
}

/** Full provider configuration for an endpoint/region pair. */
export function getS3ProviderConfig(
  endpoint?: string | null,
  region?: string | null,
): S3ProviderConfig {
  const actualRegion = region ?? DEFAULT_REGION;
  const actualEndpoint = endpoint ?? DEFAULT_ENDPOINT;
  const isAwsS3 = isAwsS3Endpoint(endpoint);

  return {
    isAwsS3,
    usePathStyle: !isAwsS3,
    stsEndpoint: isAwsS3 ? `https://sts.${actualRegion}.amazonaws.com` : actualEndpoint,
    s3Endpoint: isAwsS3 ? `https://s3.${actualRegion}.amazonaws.com` : actualEndpoint,
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
