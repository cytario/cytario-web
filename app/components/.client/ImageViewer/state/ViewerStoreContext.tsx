import type { Credentials } from "@aws-sdk/client-sts";
import { loadOmeTiff } from "@hms-dbmi/viv";
import { createContext, useContext, ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import { loadBioformatsZarrWithCredentials } from "./loadBioformatsZarrWithCredentials";
import { ViewerStore } from "./types";
import type { BucketConfig } from "~/.generated/client";
import { isZarrPath } from "~/utils/zarrUtils";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface RegisterViewerOptions {
  id: string;
  url: string;
  offsetsUrl?: string;
  credentials?: Credentials;
  bucketConfig?: BucketConfig;
}

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (options: RegisterViewerOptions) => ViewerStoreApi;
}

const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: ({ id, url, offsetsUrl, credentials, bucketConfig }) => {
        const existingStore = get().viewers[id];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(id);
        const viewerState = viewerStore.getState();

        const isZarr = isZarrPath(url);

        if (isZarr && credentials) {
          // Load bioformats2raw zarr with credentials
          loadBioformatsZarrWithCredentials(url, {
            credentials,
            bucketConfig,
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
        } else {
          // Load OME-TIFF with presigned URL, optionally with offset sidecar
          const fetchOffsets = async (): Promise<number[] | undefined> => {
            if (!offsetsUrl) return undefined;
            try {
              const response = await fetch(offsetsUrl);
              if (!response.ok) return undefined;
              const json: unknown = await response.json();
              if (
                !Array.isArray(json) ||
                !json.every((v) => typeof v === "number")
              ) {
                console.warn("Invalid OME-TIFF offsets format, expected number[]");
                return undefined;
              }
              return json;
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
        }

        set(
          (registryState) => ({
            viewers: { ...registryState.viewers, [id]: viewerStore },
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
  resourceId: string;
  url: string;
  offsetsUrl?: string;
  credentials?: Credentials;
  bucketConfig?: BucketConfig;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  url,
  offsetsUrl,
  credentials,
  bucketConfig,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);
  const store = useMemo(
    () => registerViewer({ id: resourceId, url, offsetsUrl, credentials, bucketConfig }),
    [resourceId, url, offsetsUrl, credentials, bucketConfig, registerViewer],
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
      "useViewerStoreContext must be used within ViewerStoreProvider",
    );
  return useStore(store, selector);
};
