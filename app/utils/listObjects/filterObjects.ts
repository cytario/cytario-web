import type { _Object } from "@aws-sdk/client-s3";

import { search } from "./search";
import { isHiddenFilename } from "~/components/DirectoryView/treeFilters";
import type { TreeFilters } from "~/components/DirectoryView/treeFilters";

/**
 * Single source of truth for which listed S3 objects are shown: query on the
 * full key, extension on the file suffix, hidden on the last key segment —
 * the same `TreeFilters` the tree views apply at render time. Hidden/extension
 * filtering only applies when a `filters` object is passed; callers that omit
 * it (plain listings) keep raw listing semantics and filter at render.
 */
export const filterObjects = (
  objects: Readonly<_Object>[] = [],
  { query, filters }: { query?: string | null; filters?: TreeFilters },
): _Object[] => {
  const suffixes = filters?.extensions?.map((ext) => `.${ext.toLowerCase()}`);
  return objects
    .reduce((acc, item) => {
      if (!item.Key) {
        return acc;
      }

      if (suffixes?.length && !suffixes.some((s) => item.Key!.toLowerCase().endsWith(s))) {
        return acc;
      }

      if (query && !search(query, item.Key)) {
        return acc;
      }

      const name = item.Key.split("/").pop() ?? item.Key;
      if (filters && !filters.showHiddenFiles && isHiddenFilename(name)) {
        return acc;
      }

      return [...acc, item];
    }, [] as _Object[])
    .sort((a, b) => a.Key!.localeCompare(b.Key!));
};
