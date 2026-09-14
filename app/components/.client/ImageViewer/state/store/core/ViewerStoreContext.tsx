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

  useEffect(() => {
    if (!channelsState && metadata) {
      addChannelsState();
    }
  }, [metadata, channelsState, addChannelsState]);

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
