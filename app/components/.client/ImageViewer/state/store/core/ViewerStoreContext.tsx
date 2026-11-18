import { useToast } from "@cytario/design";
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
import type { LocalFileSource } from "@cytario/plugin-api";
import type { SignedFetch } from "~/utils/signedFetch";

const ViewerStoreContext = createContext<ViewerStoreApi | null>(null);

export { ViewerStoreContext };

interface ViewerStoreProviderProps {
  resourceId: string;
  signedFetch: SignedFetch | null;
  userId: string;
  /** Present for a local open: registers the viewer against the File source. */
  localSource?: LocalFileSource;
  children: ReactNode;
}

export const ViewerStoreProvider = ({
  resourceId,
  signedFetch,
  userId,
  localSource,
  children,
}: ViewerStoreProviderProps) => {
  const registerViewer = useViewerRegistryStore((s) => s.registerViewer);
  const registerLocalViewer = useViewerRegistryStore((s) => s.registerLocalViewer);
  const { toast } = useToast();

  // toast (= addToast) is referentially stable; an unstable emitter here would
  // recreate every viewer store on each render.
  const store = useMemo(() => {
    if (localSource) {
      return (
        registerLocalViewer(resourceId.slice("local/".length), localSource, userId, toast) ??
        undefined
      );
    }
    if (!signedFetch) return undefined;
    return registerViewer(resourceId, signedFetch, userId, toast);
  }, [resourceId, signedFetch, userId, registerViewer, registerLocalViewer, toast, localSource]);

  if (!store) {
    return <>{children}</>;
  }

  return (
    <StoreEffects store={store} resourceId={resourceId} signedFetch={signedFetch}>
      {children}
    </StoreEffects>
  );
};

/**
 * Store-bound effects, mounted only once the store exists so the hooks below
 * always see a real store (a local open whose format is not locally openable
 * resolves to no store at all).
 */
const StoreEffects = ({
  store,
  resourceId,
  signedFetch,
  children,
}: {
  store: ViewerStoreApi;
  resourceId: string;
  signedFetch: SignedFetch | null;
  children: ReactNode;
}) => {
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
    if (signedFetch) {
      ensureLoaded.current(resourceId, signedFetch);
    }
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
