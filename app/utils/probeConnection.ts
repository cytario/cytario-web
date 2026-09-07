import type { _Object } from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/client-sts";

import type { ConnectionConfig } from "~/.generated/client";
import { findFirstImage } from "~/utils/findFirstImage";
import type { BucketAddress } from "~/utils/resourceId";
import { CorsLikelyError } from "~/utils/signedFetch";

/** Non-secret provider address (region/endpoint) resolved from the catalog. */
export interface ProbeProvider {
  region?: string | null;
  endpoint?: string | null;
}

export interface ConnectionProbeResult {
  previewObj?: _Object;
  status: "connected" | "error";
  errorMessage?: string;
}

/**
 * Per-connection health probe. One bounded `ListObjectsV2` verifies the bucket
 * is reachable and, as a side benefit, surfaces the first image as a preview
 * candidate. `CorsLikelyError` is reported as a reachability failure.
 *
 * Shared by the `/connections` card-preview enrichment and the app-level
 * `useConnectionHealthProbe`.
 */
export async function probeConnection(
  config: ConnectionConfig,
  credentials: Credentials,
  provider?: ProbeProvider,
  signal?: AbortSignal,
): Promise<ConnectionProbeResult> {
  try {
    const address: BucketAddress & { id: string } = {
      id: config.id,
      bucketName: config.bucketName,
      region: provider?.region,
      endpoint: provider?.endpoint,
    };
    const previewObj = await findFirstImage(address, credentials, config.prefix ?? "", signal);
    return { previewObj, status: "connected" };
  } catch (error) {
    if (error instanceof CorsLikelyError) {
      return {
        status: "error",
        errorMessage: "Browser blocked from reading the bucket — check the bucket's CORS policy.",
      };
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    return { status: "error", errorMessage: message };
  }
}
