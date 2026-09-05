import { createContext, useContext, useEffect, type ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { attachAnnotationSync } from "./annotationSync";
import { createViewerStore } from "./createViewerStore";
import type { ViewerStore } from "./types";
import { attachViewSync } from "./viewSync";
import { registerBuiltinFormats } from "../formats/builtins";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

// Idempotent — guarantees built-ins are registered by the time this provider
// mounts, in both production and tests (where entry.client.tsx does not run).
registerBuiltinFormats();

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (resourceId: string, signedFetch: SignedFetch, userId: string) => ViewerStoreApi;
}

// Mounted-provider refcounts per resourceId, plus the AbortController of the
// most recent load. Loaders pin the geotiff source (its block cache is
// unbounded by design) and the decode pool, so keeping them for every image
// ever viewed — viewer pages and grid/bucket preview slots alike — accumulates
// until the tab OOMs. The registry instead keeps only the lightweight state
// (channels, view, annotations) and reloads pixels when the image comes back
// into view.
const mountedProviders = new Map<string, number>();
const loadAborters = new Map<string, AbortController>();

function startViewerLoad(
  viewerStore: ViewerStoreApi,
  resourceId: string,
  signedFetch: SignedFetch,
) {
  const abortController = new AbortController();
  loadAborters.set(resourceId, abortController);
  const viewerState = viewerStore.getState();
  viewerState.setIsViewerLoading(true);

  const loadImage = async () => {
    const { httpsUrl } = resolveResourceId(resourceId);
    const { handler } = formatRegistry.resolve(httpsUrl);
    return handler.load(httpsUrl, {
      signedFetch,
      signal: abortController.signal,
    });
  };

  loadImage()
    .then(({ data: loader, metadata }) => {
      viewerState.setLoader(loader);
      viewerState.setMetadata(metadata);
    })
    .catch((error: Error) => {
      // A deliberate release aborts the load; don't surface that as an error.
      if (abortController.signal.aborted) return;
      viewerState.setError(error);
    })
    .finally(() => {
      if (loadAborters.get(resourceId) === abortController) {
        loadAborters.delete(resourceId);
      }
      if (!abortController.signal.aborted) {
        viewerState.setIsViewerLoading(false);
      }
    });
}

function releaseViewer(resourceId: string) {
  loadAborters.get(resourceId)?.abort();
  loadAborters.delete(resourceId);
  const viewerStore = useViewerRegistryStore.getState().viewers[resourceId];
  if (!viewerStore) return;
  const viewerState = viewerStore.getState();
  if (viewerState.loader?.length) {
    viewerState.setLoader([]);
  }
  viewerState.setIsViewerLoading(true);
}

/**
 * Caches viewer stores by the stable resourceId (`connectionName/pathName`) so
 * navigating back preserves channels, view state, overlays — and so persisted
 * state survives connection/endpoint/URL-shape changes (C-270). The S3 URL is
 * derived from the resourceId for loading only; it is never the identity. Lazy
 * credentials mean cached stores pick up fresh STS tokens automatically.
 */
const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: (resourceId, signedFetch, userId) => {
        const existingStore = get().viewers[resourceId];
        if (existingStore) {
          if (userId && existingStore.getState().currentUserId !== userId) {
            existingStore.setState((state) => {
              state.currentUserId = userId;
              for (const ls of state.layersStates) {
                if (!ls.author) ls.author = userId;
              }
            });
          }
          // The store survived a release (last provider unmounted); reload.
          const state = existingStore.getState();
          if (!state.loader?.length && !state.error && !loadAborters.has(resourceId)) {
            startViewerLoad(existingStore, resourceId, signedFetch);
          }
          return existingStore;
        }

        const viewerStore = createViewerStore(resourceId, userId);

        // Annotation ↔ S3 sync (read+seed+debounced per-user write), bound to
        // the store (not a component) so it loads once per image and pending
        // writes survive image switches and panel collapse.
        attachAnnotationSync(viewerStore);
        attachViewSync(viewerStore);

        startViewerLoad(viewerStore, resourceId, signedFetch);

        set(
          (registryState) => ({
            viewers: { ...registryState.viewers, [resourceId]: viewerStore },
          }),
          false,
          "registerViewer",
        );

        return viewerStore;
      },
    }),
    { name: "ViewerRegistryStore" },
  ),
);

const ViewerStoreContext = createContext<ViewerStoreApi | null>(null);

/** Exposed so the undo/redo hook can read the raw store API (to reach
 *  `store.temporal`) without subscribing to the entire state. */
export { ViewerStoreContext };

interface ViewerStoreProviderProps {
  /** Stable image identity (`connectionName/pathName`). Keys the store and is
   *  resolved to the S3 URL for loading. */
  resourceId: string;
  /** Sigv4-signing fetch function. Resolves credentials lazily per request. */
  signedFetch: SignedFetch;
  /** Keycloak `sub` of the current user — scopes per-user sidecar writes. */
  userId: string;
  children: ReactNode;
}

// Caller owns signing; the viewer derives the S3 URL from the resourceId.
export const ViewerStoreProvider = ({
  resourceId,
  signedFetch,
  userId,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);

  const store = useMemo(
    () => registerViewer(resourceId, signedFetch, userId),
    [resourceId, signedFetch, userId, registerViewer],
  );

  // The last provider for a resourceId releases its loader (geotiff source,
  // block cache, decode pool) so navigating across many large images can't
  // accumulate them for the lifetime of the tab.
  useEffect(() => {
    mountedProviders.set(resourceId, (mountedProviders.get(resourceId) ?? 0) + 1);
    return () => {
      const remaining = (mountedProviders.get(resourceId) ?? 1) - 1;
      if (remaining <= 0) {
        mountedProviders.delete(resourceId);
        releaseViewer(resourceId);
      } else {
        mountedProviders.set(resourceId, remaining);
      }
    };
  }, [resourceId]);

  return <ViewerStoreContext.Provider value={store}>{children}</ViewerStoreContext.Provider>;
};

/** Access the viewer store from within a ViewerStoreProvider. */
export const useViewerStore = <T,>(selector: (state: ViewerStore) => T): T => {
  const store = useContext(ViewerStoreContext);

  if (!store) throw new Error("useViewerStoreContext must be used within ViewerStoreProvider");
  return useStore(store, selector);
};
