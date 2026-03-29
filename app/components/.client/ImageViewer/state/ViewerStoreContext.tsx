import { loadOmeTiff } from "@hms-dbmi/viv";
import { loadCzi } from "@slash-m/czi-loader";
import { createContext, useContext, ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import { adaptCziToViv } from "./cziPixelSource";
import { ViewerStore } from "./types";

export type ImageFormat = "ome-tiff" | "czi";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (
    id: string,
    url: string,
    format: ImageFormat,
    offsetsUrl?: string,
  ) => ViewerStoreApi;
}

async function fetchOmeTiffOffsets(
  offsetsUrl?: string,
): Promise<number[] | undefined> {
  if (!offsetsUrl) return undefined;
  try {
    const response = await fetch(offsetsUrl);
    if (!response.ok) return undefined;
    const json: unknown = await response.json();
    if (!Array.isArray(json) || !json.every((v) => typeof v === "number")) {
      console.warn("Invalid OME-TIFF offsets format, expected number[]");
      return undefined;
    }
    return json;
  } catch (error) {
    console.warn("Failed to fetch OME-TIFF offsets:", error);
    return undefined;
  }
}

const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: (id, url, format, offsetsUrl) => {
        const existingStore = get().viewers[id];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(id);
        const viewerState = viewerStore.getState();

        const loadImage = async () => {
          if (format === "czi") {
            const result = await loadCzi(url, {
              headers: { "Cache-Control": "public, max-age=3600" },
            });
            return adaptCziToViv(result);
          }

          const offsets = await fetchOmeTiffOffsets(offsetsUrl);
          return loadOmeTiff(url, {
            headers: {
              "Content-Type": "application/tiff",
              "Cache-Control": "public, max-age=3600",
            },
            offsets,
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
  format?: ImageFormat;
  offsetsUrl?: string;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  url,
  format = "ome-tiff",
  offsetsUrl,
  children,
}: ViewerStoreProviderProps) => {
  const store = useMemo(
    () => useViewerRegistryStore.getState().registerViewer(resourceId, url, format, offsetsUrl),
    [resourceId, url, format, offsetsUrl]
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
