import { IconButton, Input } from "@cytario/design";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useSidebarStore } from "../useSidebarStore";

const DEBOUNCE_MS = 300;

// Focused by the Cmd/Ctrl+B shortcut.
export const SIDEBAR_SEARCH_INPUT_ID = "sidebar-search-input";

export function SidebarSearchInput() {
  const setSearchQuery = useSidebarStore((s) => s.setSearchQuery);
  const [value, setValue] = useState(() => useSidebarStore.getState().searchQuery);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  const onChange = (next: string) => {
    setValue(next);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setSearchQuery(next), DEBOUNCE_MS);
  };

  const onClear = () => {
    setValue("");
    if (timeout.current) clearTimeout(timeout.current);
    setSearchQuery("");
  };

  return (
    <div className="flex items-center gap-1 px-2">
      <Search size={16} className="shrink-0 text-(--color-text-secondary)" aria-hidden />
      <Input
        id={SIDEBAR_SEARCH_INPUT_ID}
        aria-label="Search connections"
        value={value}
        onChange={onChange}
        placeholder="Search…"
      />
      {value ? (
        <IconButton icon={X} size="sm" variant="ghost" onPress={onClear} aria-label="Clear search" />
      ) : null}
    </div>
  );
}
