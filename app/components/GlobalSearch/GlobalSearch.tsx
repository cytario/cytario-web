import { useEffect, useRef, useState } from "react";

import { SearchBar } from "./SearchBar";
import { Suggestions } from "./Suggestions";
import { useSearchParam } from "~/hooks/useSearchParam";
import { useSearchAcrossConnections } from "~/routes/connectionIndex/useSearchAcrossConnections";

const DEBOUNCE_DURATION = 300;

export const GlobalSearch = () => {
  const [searchQuery, setSearchQuery] = useSearchParam("query");

  const timeout = useRef(setTimeout(() => {}, 0));
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState(searchQuery);
  const [showResults, setShowResults] = useState(false);
  const [activeQuery, setActiveQuery] = useState("");

  const { nodes } = useSearchAcrossConnections(activeQuery);

  const handleSubmit = async (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      setActiveQuery(value);
      setShowResults(true);
    } else {
      setActiveQuery("");
      setShowResults(false);
    }
  };

  const handleInputChange = (value: string) => {
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
    <div ref={parentRef} className={`relative flex items-center grow max-w-md`}>
      <SearchBar
        value={query}
        onChange={handleInputChange}
        onClear={() => {
          setQuery("");
          setShowResults(false);
        }}
      />

      <Suggestions nodes={nodes} showResults={showResults} />
    </div>
  );
};
