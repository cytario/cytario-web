import { useCallback, useEffect, useRef, useState } from "react";

import { SearchBar } from "./SearchBar";
import { Suggestions } from "./Suggestions";
import {
  searchIndex,
  getIndexedBuckets,
} from "~/components/IndexStatus/queryIndex";
import { useSearchParam } from "~/hooks/useSearchParam";
import { BucketFiles } from "~/routes/search.route";

export interface GlobalSearchResults {
  files: BucketFiles;
}

export const DEFAULT_RESULTS: GlobalSearchResults = {
  files: {},
};

const DEBOUNCE_DURATION = 300;

export const GlobalSearch = () => {
  const [searchQuery, setSearchQuery] = useSearchParam("query");

  const timeout = useRef(setTimeout(() => {}, 0));
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(searchQuery);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>(DEFAULT_RESULTS);

  const handleSearch = useCallback(
    async (value: string) => {
      setSearchQuery(value);

      if (!value.trim()) {
        setResults(DEFAULT_RESULTS);
        setShowResults(false);
        return;
      }

      const indexedBuckets = getIndexedBuckets();
      if (indexedBuckets.length === 0) {
        // No indexed buckets available
        setResults(DEFAULT_RESULTS);
        setShowResults(true);
        return;
      }

      try {
        const searchResults = await searchIndex(value, indexedBuckets);

        // Convert search results to BucketFiles format
        const files: BucketFiles = {};
        for (const result of searchResults) {
          files[result.bucketKey] = result.entries.map((entry) => ({
            Key: entry.key,
            Size: entry.size,
            LastModified: entry.lastModified,
            ETag: entry.etag ?? undefined,
          }));
        }

        setResults({ files });
        setShowResults(true);
      } catch (error) {
        console.error("[GlobalSearch] Search failed:", error);
        setResults(DEFAULT_RESULTS);
      }
    },
    [setSearchQuery]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => handleSearch(value), DEBOUNCE_DURATION);
  };

  const handleClickOutside = (event: Event) => {
    if (
      parentRef.current &&
      !parentRef.current.contains(event.target as Node)
    ) {
      setShowResults(false);
    }
  };

  useEffect(() => {
    document.addEventListener("click", handleClickOutside, true);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
    };
  }, []);

  return (
    <div
      ref={parentRef}
      className={`relative flex items-center flex-grow max-w-md`}
    >
      <SearchBar
        value={query}
        onChange={handleInputChange}
        onClear={() => {
          setQuery("");
          setResults(DEFAULT_RESULTS);
          setShowResults(false);
        }}
      />

      <Suggestions results={results} showResults={showResults} />
    </div>
  );
};
