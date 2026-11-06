import { useEffect, useState } from "react";
import { useParams } from "react-router";

import type { BucketCatalog } from "~/utils/bucketCatalog.schema";

interface BucketCatalogState {
  source?: "portal" | "oss";
  catalog?: BucketCatalog;
  error?: string;
  loading: boolean;
}

/**
 * Fetch the active organization's registered-bucket catalog (admin-portal
 * builds) for the connection-creation bucket picker. The page's `/:org`
 * segment is forwarded so a tab on another membership's org fetches that
 * org's catalog — the session's preferred org is only a fallback. In OSS
 * builds the route returns `{ source: "oss" }` and the caller renders a
 * free-text input.
 *
 * Advisory: on a stale/unavailable lookup this surfaces a clear `error` and
 * never blocks — the caller degrades to an error banner with no free-text
 * fallback (an already-created connection is never invalidated).
 */
export function useBucketCatalog(): BucketCatalogState {
  const organization = useParams().org;
  const [state, setState] = useState<BucketCatalogState>(() =>
    // The forms that mount this hook always render under /:org. If the param
    // is somehow absent, fail closed without fetching: the org-less path is
    // not a route.
    organization ? { loading: true } : { error: "Bucket catalog is unavailable.", loading: false },
  );

  useEffect(() => {
    if (!organization) return;
    const controller = new AbortController();
    // Org-scoped data plane: the org is a path segment under /api/v1.
    const url = `/api/v1/${encodeURIComponent(organization)}/bucket-catalog`;
    fetch(url, { signal: controller.signal })
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
  }, [organization]);

  return state;
}
