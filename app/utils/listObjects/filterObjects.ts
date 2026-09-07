import { _Object } from "@aws-sdk/client-s3";

import { search } from "./search";

export const filterObjects = (
  objects: Readonly<_Object>[] = [],
  { query, extension }: { query?: string | null; extension?: string },
): _Object[] => {
  const suffix = extension ? `.${extension.toLowerCase()}` : null;
  return objects
    .reduce((acc, item) => {
      if (!item.Key) {
        return acc;
      }

      if (suffix && !item.Key.toLowerCase().endsWith(suffix)) {
        return acc;
      }

      if (query && !search(query, item.Key)) {
        return acc;
      }

      return [...acc, item];
    }, [] as _Object[])
    .sort((a, b) => a.Key!.localeCompare(b.Key!));
};
