import { createContext, useContext, type ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { attachAnnotationAutosave } from "./annotationAutosave";
import { createViewerStore } from "./createViewerStore";
import type { ViewerStore } from "./types";
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
  registerViewer: (resourceId: string, signedFetch: SignedFetch) => ViewerStoreApi;
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
      registerViewer: (resourceId, signedFetch) => {
        const existingStore = get().viewers[resourceId];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(resourceId);
        const viewerState = viewerStore.getState();
        const abortController = new AbortController();

        // Debounced S3 autosave for annotations, bound to the store (not a
        // component) so pending writes survive image switches.
        attachAnnotationAutosave(viewerStore);

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

interface ViewerStoreProviderProps {
  /** Stable image identity (`connectionName/pathName`). Keys the store and is
   *  resolved to the S3 URL for loading. */
  resourceId: string;
  /** SigV4-signing fetch function. Resolves credentials lazily per request. */
  signedFetch: SignedFetch;
  children: ReactNode;
}

// Caller owns signing; the viewer derives the S3 URL from the resourceId.
export const ViewerStoreProvider = ({
  resourceId,
  signedFetch,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);

  const store = useMemo(
    () => registerViewer(resourceId, signedFetch),
    [resourceId, signedFetch, registerViewer],
  );

  return <ViewerStoreContext.Provider value={store}>{children}</ViewerStoreContext.Provider>;
};

/** Access the viewer store from within a ViewerStoreProvider. */
export const useViewerStore = <T,>(selector: (state: ViewerStore) => T): T => {
  const store = useContext(ViewerStoreContext);

  if (!store) throw new Error("useViewerStoreContext must be used within ViewerStoreProvider");
  return useStore(store, selector);
};
