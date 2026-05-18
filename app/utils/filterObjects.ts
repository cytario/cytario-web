import { _Object } from "@aws-sdk/client-s3";

import { search } from "~/components/GlobalSearch/search";

export const filterObjects = (
  objects: Readonly<_Object>[] = [],
  { query }: { query?: string | null },
): _Object[] => {
  return objects
    .reduce((acc, item) => {
      if (!item.Key) {
        return acc;
      }

      if (query && !search(query, item.Key)) {
        return acc;
      }

      return [...acc, item];
    }, [] as _Object[])
    .sort((a, b) => a.Key!.localeCompare(b.Key!));
};
