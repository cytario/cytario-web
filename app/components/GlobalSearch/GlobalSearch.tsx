import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { SearchBar } from "./SearchBar";
import { Suggestions } from "./Suggestions";
import { TreeNode } from "../DirectoryView/buildDirectoryTree";
import { useSearchParam } from "~/hooks/useSearchParam";
import { SearchRouteLoaderResponse } from "~/routes/search.route";

const DEBOUNCE_DURATION = 300;

export const GlobalSearch = () => {
  const [searchQuery, setSearchQuery] = useSearchParam("query");

  const fetcher = useFetcher<SearchRouteLoaderResponse>();
  const timeout = useRef(setTimeout(() => {}, 0));
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(searchQuery);
  const [showResults, setShowResults] = useState(false);

  const nodes: TreeNode[] = fetcher.data?.nodes ?? [];

  // Treat the debounce window as "loading" too — otherwise the dropdown
  // flashes "No results" between keystrokes.
  const lastResultsQuery = fetcher.data?.searchQuery ?? "";
  const trimmedQuery = query.trim();
  const isLoading =
    trimmedQuery.length > 0 && (fetcher.state !== "idle" || trimmedQuery !== lastResultsQuery);

  const handleSubmit = async (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      fetcher.submit({ query: value }, { method: "get", action: "/search" });
      setShowResults(true);
    } else {
      setShowResults(false);
    }
  };

  const handleInputChange = (value: string) => {
    setQuery(value);

    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => handleSubmit(value), DEBOUNCE_DURATION);
  };

  const handleClickOutside = (event: Event) => {
    if (parentRef.current && !parentRef.current.contains(event.target as Node)) {
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
    <div ref={parentRef} className={`relative flex items-center grow max-w-md`}>
      <SearchBar
        value={query}
        onChange={handleInputChange}
        onClear={() => {
          setQuery("");
          setShowResults(false);
        }}
      />

      <Suggestions nodes={nodes} showResults={showResults} isLoading={isLoading} />
    </div>
  );
};
