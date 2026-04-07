import { createContext, useContext, type ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import type { ViewerStore } from "./types";
import { loadBioformatsZarrWithCredentials } from "../loaders/loadBioformatsZarrWithCredentials";
import { loadOmeTiffWithCredentials } from "../loaders/loadOmeTiffWithCredentials";
import type { SignedFetch } from "~/utils/signedFetch";
import { isZarrPath } from "~/utils/zarrUtils";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (url: string, signedFetch: SignedFetch) => ViewerStoreApi;
}

/**
 * Module-level registry that caches viewer stores by S3 URL.
 * Returning a cached store preserves all image state (channels, view state,
 * overlays) when navigating back to a previously viewed image.
 *
 * The signedFetch function resolves credentials lazily per request, so cached
 * stores automatically use fresh credentials after STS token rotation.
 */
const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: (url, signedFetch) => {
        const existingStore = get().viewers[url];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(url);
        const viewerState = viewerStore.getState();

        // Strategy: select loader based on format detected from URL
        const loadImage = isZarrPath(url)
          ? () => loadBioformatsZarrWithCredentials(url, signedFetch)
          : () => loadOmeTiffWithCredentials(url, signedFetch);

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
            viewers: { ...registryState.viewers, [url]: viewerStore },
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
  /** Direct S3 URL to the image (constructed by the caller via constructS3Url). */
  url: string;
  /** SigV4-signing fetch function. Resolves credentials lazily per request. */
  signedFetch: SignedFetch;
  children: ReactNode;
}

/**
 * Provides a viewer store to its children. The viewer is auth-agnostic —
 * it receives a pre-built URL and a signing function, keeping credential
 * management entirely in the caller's domain.
 */
export const ViewerStoreProvider = ({
  url,
  signedFetch,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);

  const store = useMemo(
    () => registerViewer(url, signedFetch),
    [url, signedFetch, registerViewer],
  );

  return (
    <ViewerStoreContext.Provider value={store}>
      {children}
    </ViewerStoreContext.Provider>
  );
};

/** Access the viewer store from within a ViewerStoreProvider. */
export const useViewerStore = <T,>(selector: (state: ViewerStore) => T): T => {
  const store = useContext(ViewerStoreContext);

  if (!store)
    throw new Error(
      "useViewerStoreContext must be used within ViewerStoreProvider",
    );
  return useStore(store, selector);
};
