import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

import type { ConnectionIndexLoaderData } from "./connectionIndex.loader";
import type { ConnectionIndexRow } from "./connectionIndexRead";

interface UseDriftCheckArgs {
  connectionName: string;
  /** Current route splat — path relative to the connection root. */
  urlPath: string;
  /** Rows the listing returned for the current slice. */
  indexRows: ConnectionIndexRow[];
  /** Skip the check entirely (e.g. viewing a single file). */
  enabled: boolean;
}

const TTL_MS = 60_000;

/**
 * Asks the server for the live one-level slice under `urlPath` and compares
 * against `indexRows`. On drift, fire-and-forget POSTs a full rebuild to
 * `/connectionIndex/:name`.
 *
 * The rendered tree is NOT updated — user sees the index's stale-but-close
 * data on this visit; the next visit renders off the rebuilt index.
 *
 * Throttled per (connection, slice) to one live check per 60 seconds. The
 * rebuild itself is fired at most once per connection per session: the first
 * drift detected anywhere in the connection triggers a full rebuild, and
 * subsequent drift checks (in any slice) won't queue a second one.
 */
export function useDriftCheck({
  connectionName,
  urlPath,
  indexRows,
  enabled,
}: UseDriftCheckArgs): void {
  const liveFetcher = useFetcher<ConnectionIndexLoaderData>();
  const rebuildFetcher = useFetcher();
  const lastCheckedAt = useRef<Record<string, number>>({});
  const rebuiltConnectionsRef = useRef<Set<string>>(new Set());

  const sliceUrl = `/connectionIndex/${encodeURIComponent(connectionName)}?slice=${encodeURIComponent(urlPath)}`;
  const rebuildUrl = `/connectionIndex/${encodeURIComponent(connectionName)}`;
  const throttleKey = `${connectionName}/${urlPath}`;

  // Fire the live-slice fetch once per URL change, throttled per slice.
  useEffect(() => {
    if (!enabled) return;
    if (rebuiltConnectionsRef.current.has(connectionName)) return;
    const last = lastCheckedAt.current[throttleKey] ?? 0;
    if (Date.now() - last < TTL_MS) return;
    lastCheckedAt.current[throttleKey] = Date.now();
    liveFetcher.load(sliceUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable; re-fire only on slice change
  }, [enabled, sliceUrl, throttleKey, connectionName]);

  // When the live slice arrives, compare and trigger a full rebuild on drift.
  // At most once per connection per session — once the rebuild is queued the
  // current page keeps its stale rows; the rebuilt index is picked up on the
  // next navigation.
  useEffect(() => {
    if (!enabled) return;
    if (liveFetcher.state !== "idle" || !liveFetcher.data?.liveSlice) return;
    if (rebuiltConnectionsRef.current.has(connectionName)) return;

    const live = liveFetcher.data.liveSlice;
    const indexSubset = filterImmediateChildren(indexRows, live.prefix);

    if (!isDrifted(indexSubset, live.objects)) return;

    rebuiltConnectionsRef.current.add(connectionName);
    rebuildFetcher.submit(null, { method: "POST", action: rebuildUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: react only to fetcher resolution
  }, [enabled, liveFetcher.state, liveFetcher.data, indexRows, connectionName]);
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
    return rows.filter((r) => {
      const key = r.Key ?? "";
      return !key.includes("/") || key.endsWith("/");
    });
  }
  return rows.filter((r) => {
    const key = r.Key ?? "";
    if (!key.startsWith(slicePrefix)) return false;
    const rest = key.slice(slicePrefix.length);
    if (rest.length === 0) return false;
    // Depth-1 = no further '/' in rest, or exactly one trailing '/' (directory marker).
    const slashIdx = rest.indexOf("/");
    return slashIdx === -1 || slashIdx === rest.length - 1;
  });
}

/**
 * Drift = the set of (Key, ETag) pairs differs between index and live.
 * Name-only comparison catches the common cases (new files, deletions);
 * etag catches in-place modifications.
 *
 * The live-side shape comes from `LiveSlice` over the wire (lowercase);
 * the index-side rows match the AWS SDK `_Object` shape (PascalCase).
 */
function isDrifted(
  indexSubset: ConnectionIndexRow[],
  liveObjects: { key: string; etag: string }[],
): boolean {
  if (indexSubset.length !== liveObjects.length) return true;
  const indexBy = new Map(
    indexSubset.map((r) => [r.Key ?? "", r.ETag ?? ""]),
  );
  for (const obj of liveObjects) {
    const indexed = indexBy.get(obj.key);
    if (indexed === undefined) return true;
    if (indexed !== obj.etag) return true;
  }
  return false;
}
