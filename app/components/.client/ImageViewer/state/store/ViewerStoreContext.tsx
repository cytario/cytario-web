import { createContext, useContext, type ReactNode, useMemo } from "react";
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
          return existingStore;
        }

        const viewerStore = createViewerStore(resourceId, userId);
        const viewerState = viewerStore.getState();
        const abortController = new AbortController();

        // Annotation ↔ S3 sync (read+seed+debounced per-user write), bound to
        // the store (not a component) so it loads once per image and pending
        // writes survive image switches and panel collapse.
        attachAnnotationSync(viewerStore);
        attachViewSync(viewerStore);

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
            viewerState.setError(error);
          })
          .finally(() => {
            viewerState.setIsViewerLoading(false);
          });

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

  return <ViewerStoreContext.Provider value={store}>{children}</ViewerStoreContext.Provider>;
};

/** Access the viewer store from within a ViewerStoreProvider. */
export const useViewerStore = <T,>(selector: (state: ViewerStore) => T): T => {
  const store = useContext(ViewerStoreContext);

  if (!store) throw new Error("useViewerStoreContext must be used within ViewerStoreProvider");
  return useStore(store, selector);
};
