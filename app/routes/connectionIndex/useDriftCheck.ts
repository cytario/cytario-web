import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import type { ConnectionIndexLoaderData } from "./connectionIndex.loader";
import type { ConnectionIndexRow } from "./connectionIndexRead";

interface UseDriftCheckArgs {
  connectionName: string;
  /** Current route splat — path relative to the connection root. */
  urlPath: string;
  /** Rows `listPrefix` returned for the current slice. */
  indexRows: ConnectionIndexRow[];
  /** Skip the check entirely (e.g. viewing a single file). */
  enabled: boolean;
}

const TTL_MS = 60_000;

/**
 * Asks the server for the live one-level slice under `urlPath` and compares
 * against `indexRows`. On drift, fire-and-forget POSTs a partial reindex to
 * `/connectionIndex/:name?slice=<urlPath>`.
 *
 * The rendered tree is NOT updated — user sees the index's stale-but-close
 * data on this visit; the next visit renders off the patched index.
 *
 * Throttled per (connection, slice): at most one live check per 60 seconds.
 */
export function useDriftCheck({
  connectionName,
  urlPath,
  indexRows,
  enabled,
}: UseDriftCheckArgs): void {
  const liveFetcher = useFetcher<ConnectionIndexLoaderData>();
  const patchFetcher = useFetcher();
  const lastCheckedAt = useRef<Record<string, number>>({});
  /**
   * Slices we've already submitted a patch for in this session.
   * Without this, revalidation after the patch re-fires the liveFetcher →
   * we'd compare against still-stale indexRows and patch in a loop.
   * The entry is cleared on URL change since the key includes the slice.
   */
  const patchedSlicesRef = useRef<Set<string>>(new Set());

  const url = `/connectionIndex/${encodeURIComponent(connectionName)}?slice=${encodeURIComponent(urlPath)}`;
  const throttleKey = `${connectionName}/${urlPath}`;

  // Fire the live-slice fetch once per URL change, throttled per slice.
  useEffect(() => {
    if (!enabled) return;
    const last = lastCheckedAt.current[throttleKey] ?? 0;
    if (Date.now() - last < TTL_MS) return;
    lastCheckedAt.current[throttleKey] = Date.now();
    liveFetcher.load(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable; re-fire only on slice change
  }, [enabled, url, throttleKey]);

  // When the live slice arrives, compare and patch if drifted. At most once
  // per (connection, slice) per session — revalidation after the patch would
  // otherwise loop us forever.
  useEffect(() => {
    if (!enabled) return;
    if (liveFetcher.state !== "idle" || !liveFetcher.data?.liveSlice) return;
    if (patchedSlicesRef.current.has(throttleKey)) return;

    const live = liveFetcher.data.liveSlice;
    const indexSubset = filterImmediateChildren(indexRows, live.prefix);

    if (!isDrifted(indexSubset, live.objects)) return;

    patchedSlicesRef.current.add(throttleKey);
    patchFetcher.submit(null, { method: "PATCH", action: url });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react only to fetcher resolution
  }, [enabled, liveFetcher.state, liveFetcher.data, indexRows, throttleKey]);
}

/**
 * Keep only rows that are depth-1 children of `slicePrefix` — matching the
 * set that `ListObjectsV2(Delimiter="/")` would return on the live side.
 */
function filterImmediateChildren(
  rows: ConnectionIndexRow[],
  slicePrefix: string,
): ConnectionIndexRow[] {
  if (!slicePrefix) {
    return rows.filter((r) => !r.key.includes("/") || r.key.endsWith("/"));
  }
  return rows.filter((r) => {
    if (!r.key.startsWith(slicePrefix)) return false;
    const rest = r.key.slice(slicePrefix.length);
    if (rest.length === 0) return false;
    // Depth-1 = no further '/' in rest, or exactly one trailing '/' (directory marker).
    const slashIdx = rest.indexOf("/");
    return slashIdx === -1 || slashIdx === rest.length - 1;
  });
}

/**
 * Drift = the set of (key, etag) pairs differs between index and live.
 * Name-only comparison catches the common cases (new files, deletions);
 * etag catches in-place modifications.
 */
function isDrifted(
  indexSubset: ConnectionIndexRow[],
  liveObjects: { key: string; etag: string }[],
): boolean {
  if (indexSubset.length !== liveObjects.length) return true;
  const indexBy = new Map(indexSubset.map((r) => [r.key, r.etag]));
  for (const obj of liveObjects) {
    const indexed = indexBy.get(obj.key);
    if (indexed === undefined) return true;
    if (indexed !== obj.etag) return true;
  }
  return false;
}
