/**
 * Server-side CORS preflight probe run at connection create / update.
 *
 * Cytario's data plane is browser-direct, so the bucket must advertise a CORS
 * policy that matches the cytario origin. Probe outcomes:
 *   - `ok: false` — the browser will hard-block reads; the form rejects.
 *   - `ok: true, warnings: ["wildcard_origin"]` — `ACAO: *` works today (the
 *     read path is non-credentialed) but is flagged for operator hygiene.
 */

import { isAllowedS3Host } from "~/utils/s3HostAllowlist";
import { SIGNED_REQUEST_HEADERS } from "~/utils/signedFetch";

export type CorsPreflightFailureReason =
  | "network"
  | "missing_origin_header"
  | "preflight_status"
  | "host_not_allowed";

export type CorsPreflightWarningReason = "wildcard_origin";

export interface CorsPreflightResult {
  ok: boolean;
  reason?: CorsPreflightFailureReason;
  warnings: CorsPreflightWarningReason[];
  detail?: string;
}

const PREFLIGHT_TIMEOUT_MS = 5_000;

/**
 * Strips IPv4 / IPv6 literals from an error `detail` so the resolved IP of an
 * upstream endpoint never reaches the operator UI — denies the probe as a
 * port-scan oracle.
 */
export function redactIpLiterals(message: string): string {
  let result = message.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, "[redacted]");
  result = result.replace(
    /(?:[0-9a-fA-F]{1,4}:){1,7}(?::[0-9a-fA-F]{1,4}){1,7}|(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|::1|::/g,
    "[redacted]",
  );
  return result;
}

/** Issue a CORS preflight against the bucket; wildcard ACAO surfaces as a warning. */
export async function probeBucketCors(
  bucketUrl: string,
  cytarioOrigin: string,
): Promise<CorsPreflightResult> {
  // Refuse out-of-allowlist URLs so the probe can never be an SSRF oracle
  // against IMDS / RFC1918 / loopback, independent of upstream form validation.
  if (!isAllowedS3Host(bucketUrl)) {
    return {
      ok: false,
      reason: "host_not_allowed",
      warnings: [],
      detail: "Host is not in the S3 allowlist",
    };
  }

  let response: Response;
  try {
    response = await globalThis.fetch(bucketUrl, {
      method: "OPTIONS",
      headers: {
        Origin: cytarioOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": SIGNED_REQUEST_HEADERS.join(", "),
      },
      // Block redirects — a 30x would leak the Origin header onward and make
      // the probe lie about the configured bucket.
      redirect: "error",
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      reason: "network",
      warnings: [],
      detail: redactIpLiterals(error instanceof Error ? error.message : String(error)),
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return {
      ok: false,
      reason: "preflight_status",
      warnings: [],
      detail: `Preflight returned HTTP ${response.status}`,
    };
  }

  const allowOrigin = response.headers.get("access-control-allow-origin");
  if (!allowOrigin) {
    return {
      ok: false,
      reason: "missing_origin_header",
      warnings: [],
      detail: "Response did not include Access-Control-Allow-Origin",
    };
  }

  const warnings: CorsPreflightWarningReason[] = [];
  if (allowOrigin.trim() === "*") {
    warnings.push("wildcard_origin");
  }

  return { ok: true, warnings };
}

/** Human-readable failure message shown on the connection form. */
export function describeCorsFailure(result: CorsPreflightResult, cytarioOrigin: string): string {
  switch (result.reason) {
    case "network":
      return "Could not reach the bucket from the cytario server. Check the endpoint URL and DNS.";
    case "missing_origin_header":
      return `Bucket does not advertise CORS for cytario. Configure the bucket's CORS policy to allow Origin ${cytarioOrigin}.`;
    case "preflight_status":
      return `Bucket rejected the cytario CORS preflight (${result.detail ?? "non-2xx response"}). Configure the bucket's CORS policy to allow Origin ${cytarioOrigin}.`;
    case "host_not_allowed":
      return `Bucket host is not in the cytario S3 allowlist. Ask the operator to add it to CYTARIO_ALLOWED_S3_HOSTS.`;
    default:
      return `Bucket CORS preflight failed: ${result.detail ?? "unknown error"}.`;
  }
}

/** Human-readable message for a non-blocking warning. */
export function describeCorsWarning(
  warning: CorsPreflightWarningReason,
  cytarioOrigin: string,
): string {
  switch (warning) {
    case "wildcard_origin":
      return `Bucket allows any origin (CORS: *). Consider restricting to ${cytarioOrigin}.`;
  }
}
