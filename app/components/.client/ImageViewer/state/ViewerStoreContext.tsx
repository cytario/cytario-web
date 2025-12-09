import { loadOmeTiff } from "@hms-dbmi/viv";
import { createContext, useContext, ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import { ViewerStore } from "./types";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (id: string, url: string) => ViewerStoreApi;
}

const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: (id, url) => {
        const existingStore = get().viewers[id];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(id);
        const viewerState = viewerStore.getState();

        loadOmeTiff(url, {
          headers: {
            "Content-Type": "application/tiff",
            "Cache-Control": "public, max-age=3600",
          },
        })
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
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  url,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);
  const store = useMemo(
    () => registerViewer(resourceId, url),
    [resourceId, url, registerViewer]
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
