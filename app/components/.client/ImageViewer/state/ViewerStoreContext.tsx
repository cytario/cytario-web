import { loadOmeTiff } from "@hms-dbmi/viv";
import { createContext, useContext, ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import { ViewerStore } from "./types";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (
    id: string,
    url: string,
    offsetsUrl?: string,
  ) => ViewerStoreApi;
}

const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: (id, url, offsetsUrl) => {
        const existingStore = get().viewers[id];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(id);
        const viewerState = viewerStore.getState();

        const fetchOffsets = async (): Promise<number[] | undefined> => {
          if (!offsetsUrl) return undefined;
          try {
            const response = await fetch(offsetsUrl);
            if (!response.ok) return undefined;
            return await response.json();
          } catch (error) {
            console.warn("Failed to fetch OME-TIFF offsets:", error);
            return undefined;
          }
        };

        fetchOffsets()
          .then((offsets) =>
            loadOmeTiff(url, {
              headers: {
                "Content-Type": "application/tiff",
                "Cache-Control": "public, max-age=3600",
              },
              offsets,
            }),
          )
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
            viewers: { ...registryState.viewers, [id]: viewerStore },
          }),
          false,
          "registerViewer"
        );

        return viewerStore;
      },
    }),
    { name: "ViewerRegistryStore" }
  )
);

const ViewerStoreContext = createContext<ViewerStoreApi | null>(null);

interface ViewerStoreProviderProps {
  resourceId: string;
  url: string;
  offsetsUrl?: string;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  url,
  offsetsUrl,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);
  const store = useMemo(
    () => registerViewer(resourceId, url, offsetsUrl),
    [resourceId, url, offsetsUrl, registerViewer],
  );

  return (
    <ViewerStoreContext.Provider value={store}>
      {children}
    </ViewerStoreContext.Provider>
  );
};

export const useViewerStore = <T,>(selector: (state: ViewerStore) => T): T => {
  const store = useContext(ViewerStoreContext);

  if (!store)
    throw new Error(
      "useViewerStoreContext must be used within ViewerStoreProvider"
    );
  return useStore(store, selector);
};
