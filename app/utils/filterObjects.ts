import { _Object } from "@aws-sdk/client-s3";

import { search } from "~/components/GlobalSearch/search";
import { cytarioConfig } from "~/config";

export const allowedFilesPattern = new RegExp(
  cytarioConfig.setup.allowedFiles,
  "i"
);

export const filterObjects = (
  objects: Readonly<_Object>[] = [],
  { query }: { query?: string | null }
): _Object[] => {
  return objects
    .reduce((acc, item) => {
      // does not match allowed file pattern
      if (!allowedFilesPattern.test(item.Key!)) {
        return acc;
      }

      // does not match provided search query
      if (query && !search(query, item.Key)) {
        return acc;
      }

      // add item to array
      return [...acc, item];
    }, [] as _Object[])
    .sort((a, b) => {
      const aIsDir = a.Key!.includes("/");
      const bIsDir = b.Key!.includes("/");

      // First, ensure directories come before files
      if (aIsDir && !bIsDir) return -1;
      if (!aIsDir && bIsDir) return 1;

      // Then, if both are either directories or files, sort them alphabetically
      return a.Key!.localeCompare(b.Key!);
    });
};
