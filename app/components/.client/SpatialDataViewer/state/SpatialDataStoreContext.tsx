import { readZarr } from "@spatialdata/core";
import { createContext, useContext, useMemo } from "react";
import { create, useStore } from "zustand";

import {
  createSpatialDataViewerStore,
  type SpatialDataViewerState,
  type SpatialDataViewerStoreApi,
} from "./createSpatialDataViewerStore";
import { createSpatialDataStore } from "./transport/createSpatialDataStore";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

interface SpatialDataRegistryStore {
  stores: Record<string, SpatialDataViewerStoreApi>;
  registerStore: (resourceId: string, signedFetch: SignedFetch) => SpatialDataViewerStoreApi;
}

const useSpatialDataRegistryStore = create<SpatialDataRegistryStore>()((set, get) => ({
  stores: {},
  registerStore: (resourceId, signedFetch) => {
    const existing = get().stores[resourceId];
    if (existing) return existing;

    const store = createSpatialDataViewerStore();

    const { httpsUrl } = resolveResourceId(resourceId);
    const zarrStore = createSpatialDataStore(httpsUrl, signedFetch);
    readZarr(zarrStore)
      .then((spatialData) => store.getState().setSpatialData(spatialData))
      .catch((error: Error) => store.getState().setError(error));

    set((state) => ({ stores: { ...state.stores, [resourceId]: store } }));

    return store;
  },
}));

const SpatialDataStoreContext = createContext<SpatialDataViewerStoreApi | null>(null);

interface SpatialDataStoreProviderProps {
  resourceId: string;
  signedFetch: SignedFetch;
  children: React.ReactNode;
}

// Caller owns signing; the store derives the zarr URL from the resourceId,
// mirroring the ImageViewer registry.
export const SpatialDataStoreProvider = ({
  resourceId,
  signedFetch,
  children,
}: SpatialDataStoreProviderProps) => {
  const registerStore = useSpatialDataRegistryStore((s) => s.registerStore);

  const store = useMemo(
    () => registerStore(resourceId, signedFetch),
    [resourceId, signedFetch, registerStore],
  );

  return (
    <SpatialDataStoreContext.Provider value={store}>{children}</SpatialDataStoreContext.Provider>
  );
};

/** Access the SpatialData viewer store from within a SpatialDataStoreProvider. */
export const useSpatialDataStore = <T,>(selector: (state: SpatialDataViewerState) => T): T => {
  const store = useContext(SpatialDataStoreContext);
  if (!store) {
    throw new Error("useSpatialDataStore must be used within SpatialDataStoreProvider");
  }
  return useStore(store, selector);
};

export { SpatialDataStoreContext };
