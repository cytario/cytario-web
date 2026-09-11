// Subpath import — the package root re-exports the Node-only FileSystemStore,
// which externalizes node:fs and breaks the browser bundle.
import FetchStore from "@zarrita/storage/fetch";

import type { SignedFetch } from "~/utils/signedFetch";

/**
 * Zarr store over SigV4-signed S3 fetches. FetchStore's wire contract is
 * 200/206 → bytes, 404 → missing key, anything else → throw. S3 answers a
 * HEAD-style probe of a missing key with 403 (the caller lacks
 * s3:ListBucket, which is what turns a 404 into a 403), so 403 is remapped
 * to 404 here rather than surfacing a spurious error for absent metadata.
 */
export function createSpatialDataStore(url: string, signedFetch: SignedFetch): FetchStore {
  return new FetchStore(url, {
    async fetch(request) {
      const headers: Record<string, string> = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const response = await signedFetch(request.url, {
        method: request.method,
        headers,
        ...(request.signal ? { signal: request.signal } : {}),
      });

      if (response.status === 403) {
        return new Response(null, { status: 404 });
      }
      return response;
    },
  });
}
