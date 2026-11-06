import { useEffect, useState } from "react";
import { useParams } from "react-router";

import type { ClientProviderCatalog } from "~/utils/providerCatalog.schema";

interface CatalogState {
  catalog?: ClientProviderCatalog;
  error?: string;
  loading: boolean;
}

/**
 * Fetch the active organization's provider catalog (browser projection) for the
 * connection / share selectors. The page's `/:org` segment is forwarded so a
 * tab on another membership's org fetches that org's catalog — the session's
 * preferred org is only a fallback, not the switcher for a background fetch.
 * Advisory: on a stale or unavailable lookup this surfaces a clear `error` and
 * never blocks — the caller degrades the selectors rather than failing
 * outright.
 */
export function useProviderCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ loading: true });
  const organization = useParams().org;

  useEffect(() => {
    const controller = new AbortController();
    // Org-scoped data plane: the org is a path segment under /api/v1.
    const url = organization
      ? `/api/v1/${encodeURIComponent(organization)}/provider-catalog`
      : "/api/provider-catalog";
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((body: { catalog?: ClientProviderCatalog; error?: string }) => {
        setState({ catalog: body.catalog, error: body.error, loading: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          error: error instanceof Error ? error.message : "Provider catalog is unavailable.",
          loading: false,
        });
      });
    return () => controller.abort();
  }, [organization]);

  return state;
}
