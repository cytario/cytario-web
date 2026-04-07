import type { Credentials } from "@aws-sdk/client-sts";
import { createContext, useContext, type ReactNode, useMemo } from "react";
import { useStore, create } from "zustand";
import { devtools } from "zustand/middleware";

import { createViewerStore } from "./createViewerStore";
import type { ViewerStore } from "./types";
import { loadBioformatsZarrWithCredentials } from "../loaders/loadBioformatsZarrWithCredentials";
import { loadOmeTiffWithCredentials } from "../loaders/loadOmeTiffWithCredentials";
import type { ConnectionConfig } from "~/.generated/client";
import { createResourceId } from "~/utils/resourceId";
import { createSignedFetch } from "~/utils/signedFetch";
import { constructS3Url, isZarrPath } from "~/utils/zarrUtils";

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

/** Connection record shape from the connections Zustand store. */
interface ConnectionRecord {
  credentials: Credentials;
  connectionConfig: ConnectionConfig;
}

interface RegisterViewerOptions {
  id: string;
  connection: ConnectionRecord;
  pathName: string;
}

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (options: RegisterViewerOptions) => ViewerStoreApi;
}

const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: ({ id, connection, pathName }) => {
        const existingStore = get().viewers[id];
        if (existingStore) return existingStore;

        const viewerStore = createViewerStore(id);
        const viewerState = viewerStore.getState();

        const { credentials, connectionConfig } = connection;
        const s3Url = constructS3Url(connectionConfig, pathName);
        const signedFetch = createSignedFetch(credentials, connectionConfig);

        // Strategy: select loader based on format
        const loadImage = isZarrPath(pathName)
          ? () => loadBioformatsZarrWithCredentials(s3Url, signedFetch)
          : () =>
              loadOmeTiffWithCredentials(s3Url, {
                signedFetch,
                connectionConfig,
                pathName,
              });

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
  connection: ConnectionRecord;
  pathName: string;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  connection,
  pathName,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);

  // Include AccessKeyId in the cache key so credential rotation creates a fresh store
  const resourceId = createResourceId(
    connection.connectionConfig.provider,
    connection.connectionConfig.bucketName,
    pathName,
  );
  const cacheKey = `${resourceId}:${connection.credentials.AccessKeyId}`;

  const store = useMemo(
    () => registerViewer({ id: cacheKey, connection, pathName }),
    [cacheKey, connection, pathName, registerViewer],
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
