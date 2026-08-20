import { Icon, IconButton, Input } from "@cytario/design";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;

export interface SearchInputProps {
  /** Debounced query sink (owned by the parent). */
  onQueryChange: (query: string) => void;
  /** Accessible label for the input element. */
  "aria-label": string;
  /** Placeholder text (defaults to "Search…"). */
  placeholder?: string;
  /** Optional id for focus-shortcut wiring. */
  id?: string;
  /** Optional className for the wrapper div (defaults to "flex items-center gap-1"). */
  className?: string;
}

export function SearchInput({
  onQueryChange,
  "aria-label": ariaLabel,
  placeholder = "Search…",
  id,
  className = "flex items-center gap-1",
}: SearchInputProps) {
  const [value, setValue] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeout.current) clearTimeout(timeout.current);
    };
  }, []);

  const onChange = (next: string) => {
    setValue(next);
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => onQueryChange(next), DEBOUNCE_MS);
  };

  const onClear = () => {
    setValue("");
    if (timeout.current) clearTimeout(timeout.current);
    onQueryChange("");
  };

  return (
    <div className={className}>
      <Icon icon="Search" size="sm" className="text-muted-foreground" />
      <Input
        size="sm"
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      {value ? (
        <IconButton icon="X" size="sm" variant="ghost" onPress={onClear} label="Clear search" />
      ) : null}
    </div>
  );
}
