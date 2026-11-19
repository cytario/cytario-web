import type { ToastData } from "@cytario/design";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { registerBuiltinFormats } from "../../formats/builtins";
import { attachAnnotationSync } from "../annotations/annotationSync";
import { createViewerStore } from "../createViewerStore";
import { attachViewSync } from "../views/viewSync";
import type { LocalFileSource } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

registerBuiltinFormats();

type ViewerStoreApi = ReturnType<typeof createViewerStore>;

interface ViewerRegistryStore {
  viewers: Record<string, ViewerStoreApi>;
  registerViewer: (
    resourceId: string,
    signedFetch: SignedFetch,
    userId: string,
    showToast?: (toast: Omit<ToastData, "id">) => void,
  ) => ViewerStoreApi;
  registerLocalViewer: (
    fileName: string,
    source: LocalFileSource,
    userId: string,
    showToast?: (toast: Omit<ToastData, "id">) => void,
  ) => ViewerStoreApi | undefined;
}

const LOCAL_CONNECTION_ID = "local";

/** Whether the viewer was mounted for a locally-opened file. */
export function isLocalResourceId(resourceId: string): boolean {
  return resourceId.startsWith(`${LOCAL_CONNECTION_ID}/`);
}

/** Fail-loud stand-in for the signed fetch a local open never has. */
function localSourceStub(url: string): Promise<Response> {
  return Promise.reject(new Error(`No signed fetch for a local source: ${url}`));
}

const localSources = new Map<string, LocalFileSource>();

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
    if (isLocalResourceId(resourceId)) {
      const source = localSources.get(resourceId);
      if (!source) throw new Error(`No local source held for: ${resourceId}`);
      const fileName = resourceId.slice(LOCAL_CONNECTION_ID.length + 1);
      const registration = formatRegistry.resolveLocalSource(fileName);
      if (!registration) throw new Error(`Format not openable as a local file: ${fileName}`);
      return registration.handler.load(fileName, {
        signedFetch: localSourceStub,
        source,
        signal: abortController.signal,
      });
    }
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
      registerViewer: (resourceId, signedFetch, userId, showToast) => {
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

        const viewerStore = createViewerStore(resourceId, userId, showToast);

        if (isLocalResourceId(resourceId)) {
          // Local open: no annotation/view sidecar syncs (there is no S3
          // prefix to write to) and no shared-preset discovery — mark the
          // view-sync gate settled so channel initialization proceeds.
          viewerStore.getState().setSharedViewsLoaded(true);
        } else {
          attachAnnotationSync(viewerStore, showToast);
          attachViewSync(viewerStore, signedFetch);
        }

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
      registerLocalViewer: (fileName, source, userId, showToast) => {
        const registration = formatRegistry.resolveLocalSource(fileName);
        if (!registration) return undefined;
        const resourceId = `${LOCAL_CONNECTION_ID}/${fileName}`;

        const existingStore = get().viewers[resourceId];
        if (existingStore) {
          localSources.set(resourceId, source);
          ensureViewerLoaded(resourceId, localSourceStub);
          return existingStore;
        }

        localSources.set(resourceId, source);
        const viewerStore = createViewerStore(resourceId, userId, showToast);
        viewerStore.getState().setSharedViewsLoaded(true);

        startViewerLoad(viewerStore, resourceId, localSourceStub);

        set(
          (registryState) => ({
            viewers: { ...registryState.viewers, [resourceId]: viewerStore },
          }),
          false,
          "registerLocalViewer",
        );

        return viewerStore;
      },
    }),
    { name: "ViewerRegistryStore" },
  ),
);
