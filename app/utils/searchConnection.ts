import type { _Object } from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/client-sts";

import { buildDirectoryTree, type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import type { Connection } from "~/utils/connectionsStore/useConnectionsStore";
import { companionDirectoryPrefixes, isLeafDirectory } from "~/utils/leafDirectory";
import { mapWithConcurrency } from "~/utils/limitConcurrency";
import { filterObjects } from "~/utils/listObjects/filterObjects";
import { listObjectsClient } from "~/utils/listObjects/listObjectsClient";
import { search } from "~/utils/listObjects/search";
import { getPrefix } from "~/utils/pathUtils";
import { CorsLikelyError } from "~/utils/signedFetch";

export interface SearchConnectionResult {
  /** Bucket-rooted TreeNode whose children are the matched paths' synthetic tree. */
  node: TreeNode;
  isCapped: boolean;
  error: boolean;
  corsBlocked: boolean;
}

/**
 * Per-connection BFS search. Walks the tree level-by-level (one `ListObjectsV2`
 * per directory with `Delimiter /`), filtering at each level with the same
 * `search()` logic the flat listing used. Leaf directories (`.zarr`, `.mrxs`,
 * …) are matched by name without descending into their interiors, and
 * companion directories are skipped entirely. All directories at the same
 * depth are listed in parallel.
 */
export async function searchConnection({
  connection,
  query,
  signal,
}: {
  connection: Connection;
  query: string;
  signal?: AbortSignal;
}): Promise<SearchConnectionResult> {
  const { connectionConfig: config, credentials, provider } = connection;
  const rootPrefix = getPrefix(config.prefix) ?? "";
  const bucketBase: TreeNode = {
    id: `${config.id}/`,
    connectionId: config.id,
    connectionName: config.name,
    name: config.name,
    type: "bucket",
    pathName: "",
  };

  if (!credentials) {
    return {
      node: { ...bucketBase, children: [] },
      isCapped: false,
      error: true,
      corsBlocked: false,
    };
  }

  const address = {
    id: config.id,
    bucketName: config.bucketName,
    region: provider?.region,
    endpoint: provider?.endpoint ?? undefined,
  };

  try {
    const { matched, isCapped } = await bfsSearch(address, credentials, rootPrefix, query, signal);
    const q = query.toLowerCase();
    const rank = (key: string) => {
      const name = key.split("/").pop() ?? key;
      const lc = name.toLowerCase();
      if (lc === q) return 0;
      if (lc.startsWith(q)) return 1;
      return 2;
    };
    matched.sort(
      (a, b) => rank(a.Key ?? "") - rank(b.Key ?? "") || (a.Key ?? "").localeCompare(b.Key ?? ""),
    );

    return {
      node: {
        ...bucketBase,
        children: buildDirectoryTree(matched, config.id, config.name, rootPrefix),
      },
      isCapped,
      error: false,
      corsBlocked: false,
    };
  } catch (error) {
    console.error(`Search failed for connection "${config.name}":`, error);
    return {
      node: { ...bucketBase, children: [] },
      isCapped: false,
      error: true,
      corsBlocked: error instanceof CorsLikelyError,
    };
  }
}

/** BFS walk collecting `_Object`s whose key (or leaf-directory name) matches `query`. */
async function bfsSearch(
  address: { id: string; bucketName: string; region?: string; endpoint?: string },
  credentials: Credentials,
  rootPrefix: string,
  query: string,
  signal?: AbortSignal,
): Promise<{ matched: _Object[]; isCapped: boolean }> {
  const matched: _Object[] = [];
  let level: string[] = [rootPrefix];
  let isCapped = false;
  let dirsVisited = 0;
  const MAX_DIRS = 500;

  while (level.length > 0) {
    if (signal?.aborted) throw signal.reason ?? new Error("Search aborted");

    if (dirsVisited + level.length > MAX_DIRS) {
      level = level.slice(0, MAX_DIRS - dirsVisited);
      isCapped = true;
    }

    const results = await mapWithConcurrency(level, 4, async (prefix) => {
      const {
        contents,
        commonPrefixes,
        isCapped: levelCapped,
      } = await listObjectsClient(address, credentials, { prefix, signal });
      if (levelCapped) isCapped = true;

      const fileMatches = filterObjects(contents, { query });

      const hidden = companionDirectoryPrefixes(contents.map((o) => o.Key ?? "").filter(Boolean));
      const leafMatches: _Object[] = [];
      const subDirs: string[] = [];

      const dirMatches: _Object[] = [];

      for (const cp of commonPrefixes) {
        if (hidden.has(cp)) continue;
        const name = cp.slice(prefix.length).replace(/\/$/, "");
        if (!name) continue;
        if (search(query, name)) {
          dirMatches.push({ Key: cp });
        } else if (!isLeafDirectory(name)) {
          subDirs.push(cp);
        }
      }

      return { fileMatches, leafMatches, dirMatches, subDirs };
    });

    dirsVisited += level.length;

    const next: string[] = [];
    for (const r of results) {
      matched.push(...r.fileMatches, ...r.leafMatches, ...r.dirMatches);
      next.push(...r.subDirs);
    }
    level = next;
  }

  return { matched, isCapped };
}
