import { useEffect, useState } from "react";

import type { BucketCatalog } from "~/utils/bucketCatalog.schema";

interface BucketCatalogState {
  source?: "portal" | "oss";
  catalog?: BucketCatalog;
  error?: string;
  loading: boolean;
}

/**
 * Fetch the active organization's registered-bucket catalog (admin-portal
 * builds) for the connection-creation bucket picker. In OSS builds the route
 * returns `{ source: "oss" }` and the caller renders a free-text input.
 *
 * Advisory: on a stale/unavailable lookup this surfaces a clear `error` and
 * never blocks — the caller degrades to an error banner with no free-text
 * fallback (an already-created connection is never invalidated).
 */
export function useBucketCatalog(): BucketCatalogState {
  const [state, setState] = useState<BucketCatalogState>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/bucket-catalog", { signal: controller.signal })
      .then((res) => res.json())
      .then((body: { source?: "portal" | "oss"; catalog?: BucketCatalog; error?: string }) => {
        setState({
          source: body.source,
          catalog: body.catalog,
          error: body.error,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          source: "portal",
          error: error instanceof Error ? error.message : "Bucket catalog is unavailable.",
          loading: false,
        });
      });
    return () => controller.abort();
  }, []);

  return state;
}
