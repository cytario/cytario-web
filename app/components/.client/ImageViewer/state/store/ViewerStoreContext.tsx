import { createContext, useContext, type ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import type { ViewerStore } from "./types";
import { registerBuiltinFormats } from "../formats/builtins";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import type { SignedFetch } from "~/utils/signedFetch";

// Idempotent — guarantees built-ins are registered by the time this provider
// mounts, in both production and tests (where entry.client.tsx does not run).
registerBuiltinFormats();

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (url: string, signedFetch: SignedFetch) => ViewerStoreApi;
}

/**
 * Caches viewer stores by URL so navigating back preserves channels,
 * view state, overlays. Lazy credentials mean cached stores pick up
 * fresh STS tokens automatically.
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
        const abortController = new AbortController();

        const loadImage = () => {
          const { handler } = formatRegistry.resolve(url);
          return handler.load(url, {
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

// Viewer is auth-agnostic — caller owns URL construction and signing.
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
