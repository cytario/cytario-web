import type { SupportedDtype } from "@vivjs/types";

import { getDtypeMax } from "../../../utils/getDtypeMax";
import type { Image, Loader } from "../ome.tif.types";
import type { ByteDomain, ViewerSlice } from "../types";

export interface CoreSlice {
  metadata: Image | null;
  loader: Loader | null;
  /** Full value range of the loader's pixel dtype (e.g. [0, 65535] for 16-bit). */
  valueRange: ByteDomain;
  error: Error | null;
  isViewerLoading: boolean;

  setError: (error: Error | null) => void;
  setMetadata: (metadata: Image) => void;
  setLoader: (loader: Loader) => void;
  setIsViewerLoading: (val: boolean) => void;
}

/** Core image lifecycle: loader, metadata, dtype value range, load/error flags. */
export const createCoreSlice: ViewerSlice<CoreSlice> = (set) => ({
  metadata: null,
  loader: [],
  valueRange: [0, 0],
  error: null,
  isViewerLoading: true,

  setError: (error) =>
    set(
      (state) => {
        state.error = error;
      },
      false,
      "setError",
    ),

  setMetadata: (metadata) =>
    set(
      (state) => {
        state.metadata = metadata;
      },
      false,
      "setMetadata",
    ),

  setLoader: (loader) =>
    set(
      (state) => {
        state.loader = loader;
        // dtype is structurally `string` in @cytario/plugin-api; one of the
        // canonical PixelType values is guaranteed at runtime.
        if (loader?.[0]) {
          state.valueRange = [0, getDtypeMax(loader[0].dtype as SupportedDtype)];
        }
      },
      false,
      "setLoader",
    ),

  setIsViewerLoading: (isViewerLoading) =>
    set(
      (state) => {
        state.isViewerLoading = isViewerLoading;
      },
      false,
      "setIsViewerLoading",
    ),
});
