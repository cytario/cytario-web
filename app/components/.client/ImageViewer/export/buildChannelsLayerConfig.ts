import { ColorPaletteExtension, MultiscaleImageLayer, SIGNAL_ABORTED } from "@hms-dbmi/viv";

import { channelsStateForPanel } from "../state/store/selectors";
import type { ChannelsState, ChannelsStateColumns, ViewerStore } from "../state/store/types";
import { mapChannelConfigsToState } from "../utils/mapChannelConfigsToState";
import { getCachedTile } from "../utils/sharedTileCache";

/** Both abort shapes loaders use: DOMException (plugins, spec) and plain Error. */
const isAbortError = (error: unknown): boolean =>
  (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";

// `getTile` runs once per tile per channel per load — and again for each
// channel of a `best-available` refinement — so serializing `params.selection`
// inline re-stringified the same array on every fetch. The selection array is
// stable for a given layer state, so memoize its JSON form per instance; a new
// layer state hands a new array and the key is rebuilt.
const selectionKeyCache = new WeakMap<object, string>();
export const selectionKey = (selection: unknown): string => {
  if (typeof selection !== "object" || selection === null) return String(selection);
  const cached = selectionKeyCache.get(selection);
  if (cached !== undefined) return cached;
  const key = JSON.stringify(selection);
  selectionKeyCache.set(selection, key);
  return key;
};

type MultiscaleImageLayerProps = ConstructorParameters<typeof MultiscaleImageLayer>[0];

export interface BuildChannelsLayerInput {
  imagePanelId: number;
  /** The panel's channel columns — the caller owns the `selections` identity. */
  columns: ChannelsStateColumns;
  rawLoader: ViewerStore["loader"];
  dtype: string;
  channelsOpacity: number;
  loadTile: (id: string) => void;
  finishTile: (id: string) => void;
}

/**
 * Constructs the panel's `MultiscaleImageLayer` — the single construction path
 * shared by the live `useChannelsLayer` hook and the off-screen export, so the
 * export's colors, contrast and channel admission cannot drift from the
 * on-screen composite.
 */
export const buildChannelsLayer = ({
  imagePanelId,
  columns,
  rawLoader,
  dtype,
  channelsOpacity,
  loadTile,
  finishTile,
}: BuildChannelsLayerInput): InstanceType<typeof MultiscaleImageLayer> | null => {
  if (!rawLoader || rawLoader.length === 0) return null;

  // The wrap is shared state: a tile fetched for the live panel is served from
  // the cache to the export, and vice versa. deck.gl's per-tile signal is
  // deliberately NOT threaded into the loader — geotiff's BlockedSource
  // coalesces sibling tiles into shared block-group fetches, so one abort kills
  // the group and every sibling rejects with AggregateError (terminal in
  // deck.gl). Stale results are discarded by deck.gl's loaderId guard instead.
  const loader = rawLoader.map((loaderLevel, levelIndex) => {
    const originalGetTile = loaderLevel.getTile.bind(loaderLevel);

    const wrappedLoader = Object.create(Object.getPrototypeOf(loaderLevel));
    Object.assign(wrappedLoader, loaderLevel);

    wrappedLoader.getTile = async (params: Parameters<typeof originalGetTile>[0]) => {
      const tileId = `${params.x}-${params.y}-${params.selection?.z || 0}`;

      loadTile(tileId);

      const cacheKey = `${levelIndex}:${params.x}:${params.y}:${selectionKey(params.selection)}`;
      const fetchTile = () =>
        getCachedTile(rawLoader, cacheKey, () => originalGetTile({ ...params, signal: undefined }));

      // deck.gl treats a getTileData rejection as terminal (content = null,
      // never re-requested — the tile parks at its blurry parent level), so a
      // single transient read error (S3 5xx/429, network blip) would strand
      // the tile with no retry anywhere. Abort errors convert to viv's
      // SIGNAL_ABORTED sentinel (deck.gl then marks the tile refinable). One
      // retry covers transient failures; persistent ones still reject.
      try {
        const result = await fetchTile();
        finishTile(tileId);
        return result;
      } catch (error) {
        if (isAbortError(error)) {
          finishTile(tileId);
          throw SIGNAL_ABORTED;
        }
        try {
          const retried = await fetchTile();
          finishTile(tileId);
          return retried;
        } catch (retryError) {
          finishTile(tileId);
          throw retryError;
        }
      }
    };

    return wrappedLoader as typeof loaderLevel;
  });

  return new MultiscaleImageLayer({
    id: `channels-${imagePanelId}`,
    loader,
    extensions: [new ColorPaletteExtension()],
    selections: columns.selections,
    contrastLimits: columns.contrastLimits,
    colors: columns.colors,
    channelsVisible: columns.channelsVisible,
    dtype,
    opacity: channelsOpacity,
    // viv defaults to `no-overlap` whenever opacity < 1, which shows blank
    // holes at the target level instead of the parent-level fallback while
    // new tiles load — visible as flicker across a zoom step. Pin
    // `best-available` so a partial-resolution image is always shown.
    refinementStrategy: "best-available",
    pickable: true,
    onTileError: (error: unknown) => {
      if (isAbortError(error)) return;
      if (error === SIGNAL_ABORTED) return;
      if (
        error instanceof AggregateError &&
        error.errors.every((e) => (e as Error | undefined)?.name === "AbortError")
      )
        return;
      console.error(error);
    },
  } as unknown as MultiscaleImageLayerProps);
};

/** The visible channels of a columns set — tooltip/pixel-readout shape. */
export const visibleChannelsOfColumns = (
  columns: ChannelsStateColumns,
): { id: string; color: number[]; selectionIndex: number }[] => {
  const result: { id: string; color: number[]; selectionIndex: number }[] = [];
  for (let i = 0; i < columns.ids.length; i++) {
    if (!columns.channelsVisible[i]) continue;
    result.push({
      id: columns.ids[i],
      color: columns.colors[i] ?? [255, 255, 255],
      selectionIndex: i,
    });
  }
  return result;
};

/**
 * One-shot column resolution for callers outside the React tree: the same
 * `mapChannelConfigsToState` admission the live hook runs, read straight from
 * the store snapshot. Identity stability of `selections` does not matter for a
 * single render, so the memo the hook maintains is skipped.
 */
export const columnsForPanelState = (
  store: ViewerStore,
  imagePanelId: number,
): ChannelsStateColumns =>
  mapChannelConfigsToState(
    channelsStateForPanel(imagePanelId)(store) ?? (Object.freeze({}) as ChannelsState),
  );
