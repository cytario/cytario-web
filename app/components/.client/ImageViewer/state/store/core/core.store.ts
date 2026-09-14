import type { SupportedDtype } from "@vivjs/types";

import type { Image, Loader } from "./ome.tif.types";
import { getDtypeMax } from "../../../utils/getDtypeMax";
import type { ByteDomain, ViewerSlice } from "../types";

export interface CoreSlice {
  metadata: Image | null;
  loader: Loader | null;
  /** Full value range of the loader's pixel dtype (e.g. [0, 65535] for 16-bit). */
  valueRange: ByteDomain;
  error: Error | null;
  isViewerLoading: boolean;
  /** Whether the async S3 settings-sidecar read has completed (success or
   *  failure). Gates channel-state init so it doesn't fire before peer-shared
   *  views have had a chance to arrive. Not persisted. */
  sharedViewsLoaded: boolean;

  setError: (error: Error | null) => void;
  setMetadata: (metadata: Image) => void;
  setLoader: (loader: Loader) => void;
  setIsViewerLoading: (val: boolean) => void;
  setSharedViewsLoaded: (val: boolean) => void;
}

/** Core image lifecycle: loader, metadata, dtype value range, load/error flags. */
export const createCoreSlice: ViewerSlice<CoreSlice> = (set) => ({
  metadata: null,
  loader: [],
  valueRange: [0, 0],
  error: null,
  isViewerLoading: true,
  sharedViewsLoaded: false,

  setError: (error) =>
    set(
      (viewerStore) => {
        viewerStore.error = error;
      },
      false,
      "setError",
    ),

  setMetadata: (metadata) =>
    set(
      (viewerStore) => {
        viewerStore.metadata = metadata;
      },
      false,
      "setMetadata",
    ),

  setLoader: (loader) =>
    set(
      (viewerStore) => {
        viewerStore.loader = loader;
        if (loader?.[0]) {
          viewerStore.valueRange = [0, getDtypeMax(loader[0].dtype as SupportedDtype)];
        }
      },
      false,
      "setLoader",
    ),

  setIsViewerLoading: (isViewerLoading) =>
    set(
      (viewerStore) => {
        viewerStore.isViewerLoading = isViewerLoading;
      },
      false,
      "setIsViewerLoading",
    ),

  setSharedViewsLoaded: (val) =>
    set(
      (viewerStore) => {
        viewerStore.sharedViewsLoaded = val;
      },
      false,
      "setSharedViewsLoaded",
    ),
});
