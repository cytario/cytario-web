import { useEffect, useState } from "react";

import type { ClientProviderCatalog } from "~/utils/providerCatalog.schema";

interface CatalogState {
  catalog?: ClientProviderCatalog;
  error?: string;
  loading: boolean;
}

/**
 * Fetch the active organization's provider catalog (browser projection) for the
 * connection / share selectors. Advisory: on a stale or unavailable lookup this
 * surfaces a clear `error` and never blocks — the caller degrades the selectors
 * rather than failing outright.
 */
export function useProviderCatalog(): CatalogState {
  const [state, setState] = useState<CatalogState>({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/provider-catalog", { signal: controller.signal })
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
  }, []);

  return state;
}
