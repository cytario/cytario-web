import type { Credentials } from "@aws-sdk/client-sts";
import { loadOmeTiff } from "@hms-dbmi/viv";
import { createContext, useContext, ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import { loadBioformatsZarrWithCredentials } from "./loadBioformatsZarrWithCredentials";
import { ViewerStore } from "./types";
import { BucketConfig } from "~/.generated/client";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface RegisterViewerOptions {
  id: string;
  url: string;
  credentials?: Credentials;
  bucketConfig?: BucketConfig;
}

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (options: RegisterViewerOptions) => ViewerStoreApi;
}

/**
 * Check if the URL points to a bioformats2raw zarr image.
 * Matches URLs containing .zarr (with or without trailing slash).
 */
function isBioformatsZarr(url: string): boolean {
  return url.includes(".zarr");
}

const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: ({ id, url, credentials, bucketConfig }) => {
        const existingStore = get().viewers[id];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(id);
        const viewerState = viewerStore.getState();

        // Determine loader based on file type
        const isZarr = isBioformatsZarr(url);

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
          // Load OME-TIFF with presigned URL
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
  credentials?: Credentials;
  bucketConfig?: BucketConfig;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  url,
  credentials,
  bucketConfig,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);
  const store = useMemo(
    () => registerViewer({ id: resourceId, url, credentials, bucketConfig }),
    [resourceId, url, credentials, bucketConfig, registerViewer],
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
