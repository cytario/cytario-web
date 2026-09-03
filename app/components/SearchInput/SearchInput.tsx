import { Icon, IconButton, Input } from "@cytario/design";
import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;

export interface SearchInputProps {
  onQueryChange: (query: string) => void;
  "aria-label": string;
  placeholder?: string;
  id?: string;
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
      <Input
        size="sm"
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        prefix={<Icon icon="Search" size="sm" className="text-muted-foreground" />}
        suffix={
          value ? (
            <IconButton icon="X" size="xs" variant="ghost" onPress={onClear} label="Clear search" />
          ) : null
        }
      />
    </div>
  );
}
