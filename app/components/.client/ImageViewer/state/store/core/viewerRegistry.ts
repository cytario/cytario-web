import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { registerBuiltinFormats } from "../../formats/builtins";
import { attachAnnotationSync } from "../annotations/annotationSync";
import { createViewerStore } from "../createViewerStore";
import { attachViewSync } from "../views/viewSync";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

registerBuiltinFormats();

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (resourceId: string, signedFetch: SignedFetch, userId: string) => ViewerStoreApi;
}

const mountedProviders = new Map<string, number>();
const loadAborters = new Map<string, AbortController>();

function startViewerLoad(
  viewerStore: ViewerStoreApi,
  resourceId: string,
  signedFetch: SignedFetch,
) {
  const abortController = new AbortController();
  loadAborters.set(resourceId, abortController);
  const viewerState = viewerStore.getState();
  viewerState.setIsViewerLoading(true);

  const loadImage = async () => {
    const { httpsUrl } = resolveResourceId(resourceId);
    const { handler } = formatRegistry.resolve(httpsUrl);
    return handler.load(httpsUrl, {
      signedFetch,
      signal: abortController.signal,
    });
  };

  loadImage()
    .then(({ data: loader, metadata }) => {
      viewerState.setLoader(loader);
      viewerState.setMetadata(metadata);
    })
    .catch((error: Error) => {
      if (abortController.signal.aborted) return;
      viewerState.setError(error);
    })
    .finally(() => {
      if (loadAborters.get(resourceId) === abortController) {
        loadAborters.delete(resourceId);
      }
      if (!abortController.signal.aborted) {
        viewerState.setIsViewerLoading(false);
      }
    });
}

export function ensureViewerLoaded(resourceId: string, signedFetch: SignedFetch) {
  const viewerStore = useViewerRegistryStore.getState().viewers[resourceId];
  if (!viewerStore) return;
  const state = viewerStore.getState();
  if (!state.loader?.length && !state.error && !loadAborters.has(resourceId)) {
    startViewerLoad(viewerStore, resourceId, signedFetch);
  }
}

function releaseViewer(resourceId: string) {
  loadAborters.get(resourceId)?.abort();
  loadAborters.delete(resourceId);
  const viewerStore = useViewerRegistryStore.getState().viewers[resourceId];
  if (!viewerStore) return;
  const viewerState = viewerStore.getState();
  if (viewerState.loader?.length) {
    viewerState.setLoader([]);
  }
  viewerState.setIsViewerLoading(true);
}

export function refcountMount(resourceId: string) {
  mountedProviders.set(resourceId, (mountedProviders.get(resourceId) ?? 0) + 1);
}

export function refcountUnmount(resourceId: string) {
  const remaining = (mountedProviders.get(resourceId) ?? 1) - 1;
  if (remaining <= 0) {
    mountedProviders.delete(resourceId);
    releaseViewer(resourceId);
  } else {
    mountedProviders.set(resourceId, remaining);
  }
}

export type { ViewerStoreApi };

export const useViewerRegistryStore = create<ViewerRegistryStore>()(
  devtools(
    (set, get) => ({
      viewers: {},
      registerViewer: (resourceId, signedFetch, userId) => {
        const existingStore = get().viewers[resourceId];
        if (existingStore) {
          if (userId && existingStore.getState().currentUserId !== userId) {
            existingStore.setState((state) => {
              state.currentUserId = userId;
              for (const ls of state.layersStates) {
                if (!ls.author) ls.author = userId;
              }
            });
          }
          ensureViewerLoaded(resourceId, signedFetch);
          return existingStore;
        }

        const viewerStore = createViewerStore(resourceId, userId);

        attachAnnotationSync(viewerStore);
        attachViewSync(viewerStore);

        startViewerLoad(viewerStore, resourceId, signedFetch);

        set(
          (registryState) => ({
            viewers: { ...registryState.viewers, [resourceId]: viewerStore },
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
