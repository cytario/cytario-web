import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { SearchBar } from "./SearchBar";
import { Suggestions } from "./Suggestions";
import { useSearchParam } from "~/hooks/useSearchParam";
import { BucketFiles, SearchRouteLoaderResponse } from "~/routes/search.route";

export interface GlobalSearchResults {
  files: BucketFiles;
}

export const DEFAULT_RESULTS: GlobalSearchResults = {
  files: {},
};

const DEBOUNCE_DURATION = 300;

export const GlobalSearch = () => {
  const [searchQuery, setSearchQuery] = useSearchParam("query");

  const fetcher = useFetcher<SearchRouteLoaderResponse>();
  const timeout = useRef(setTimeout(() => {}, 0));
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(searchQuery);
  const [showResults, setShowResults] = useState(false);

  // Derive results from fetcher data
  const results = fetcher.data?.results ?? DEFAULT_RESULTS;

  const handleSubmit = async (value: string) => {
    setSearchQuery(value);
    // Trigger fetcher only if there's input
    if (value.trim()) {
      fetcher.submit({ query: value }, { method: "get", action: "/search" });
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => handleSubmit(value), DEBOUNCE_DURATION);
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
          setShowResults(false);
        }}
      />

      <Suggestions results={results} showResults={showResults} />
    </div>
  );
};
