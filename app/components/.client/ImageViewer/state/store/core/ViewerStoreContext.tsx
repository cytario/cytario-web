import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useStore } from "zustand";

import { select } from "../selectors";
import type { ViewerStore } from "../types";
import {
  ensureViewerLoaded,
  refcountMount,
  refcountUnmount,
  useViewerRegistryStore,
  type ViewerStoreApi,
} from "./viewerRegistry";
import type { SignedFetch } from "~/utils/signedFetch";

const ViewerStoreContext = createContext<ViewerStoreApi | null>(null);

export { ViewerStoreContext };

interface ViewerStoreProviderProps {
  resourceId: string;
  signedFetch: SignedFetch;
  userId: string;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  signedFetch,
  userId,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);

  const store = useMemo(
    () => registerViewer(resourceId, signedFetch, userId),
    [resourceId, signedFetch, userId, registerViewer],
  );

  const metadata = useStore(store, select.metadata);
  const channelsState = useStore(store, select.channelsState);
  const addChannelsState = useStore(store, select.addChannelsState);
  const sharedViewsLoaded = useStore(store, select.sharedViewsLoaded);

  useEffect(() => {
    if (!channelsState && metadata && sharedViewsLoaded) {
      addChannelsState();
    }
  }, [metadata, channelsState, addChannelsState, sharedViewsLoaded]);

  const ensureLoaded = useRef(ensureViewerLoaded);
  useEffect(() => {
    ensureLoaded.current(resourceId, signedFetch);
  }, [resourceId, signedFetch]);

  useEffect(() => {
    refcountMount(resourceId);
    return () => {
      refcountUnmount(resourceId);
    };
  }, [resourceId]);

  return <ViewerStoreContext.Provider value={store}>{children}</ViewerStoreContext.Provider>;
};

export const useViewerStore = <T,>(selector: (state: ViewerStore) => T): T => {
  const store = useContext(ViewerStoreContext);

  if (!store) throw new Error("useViewerStoreContext must be used within ViewerStoreProvider");
  return useStore(store, selector);
};

/**
 * The store API itself, for imperative reads/writes that must not subscribe
 * (e.g. a handler that needs `viewStateActive` only at click time). Subscribing
 * via {@link useViewerStore} in those components re-rendered them on every
 * viewport frame.
 */
export const useViewerStoreApi = (): ViewerStoreApi => {
  const store = useContext(ViewerStoreContext);

  if (!store) throw new Error("useViewerStoreApi must be used within ViewerStoreProvider");
  return store;
};
