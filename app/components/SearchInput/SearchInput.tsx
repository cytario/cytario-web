import { Icon, IconButton, Input } from "@cytario/design";
import { useEffect, useRef, useState, type ReactNode } from "react";

const DEBOUNCE_MS = 300;

export interface SearchInputProps {
  onQueryChange: (query: string) => void;
  "aria-label": string;
  placeholder?: string;
  id?: string;
  className?: string;
  /** Initial text. Caller must also pass it to onQueryChange's consumer — the input does not fire on mount. */
  defaultValue?: string;
  /** Static content inside the input suffix (scope badge etc.), before the clear button. */
  suffix?: ReactNode;
}

export function SearchInput({
  onQueryChange,
  "aria-label": ariaLabel,
  placeholder = "Search…",
  id,
  className = "flex items-center gap-1",
  defaultValue,
  suffix,
}: SearchInputProps) {
  const [value, setValue] = useState(defaultValue ?? "");
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

  const onReset = () => {
    const next = defaultValue ?? "";
    setValue(next);
    if (timeout.current) clearTimeout(timeout.current);
    onQueryChange(next);
  };

  // Clear lives in the input suffix (universal clear-text affordance); reset
  // is a deliberate restore-to-default, so it sits beside the input like
  // every other reset in the codebase (FilterBar, MinMaxSettings).
  const showReset = defaultValue !== undefined && value !== defaultValue;
  const showClear = value !== "";

  return (
    <div className={className}>
      <Input
        size="sm"
        id={id}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="flex-1"
        prefix={<Icon icon="Search" size="sm" className="text-muted-foreground" />}
        suffix={
          <>
            {suffix}
            {showClear && (
              <IconButton
                icon="X"
                size="xs"
                variant="ghost"
                onPress={onClear}
                label="Clear search"
              />
            )}
          </>
        }
      />
      {showReset && (
        <IconButton
          icon="RotateCcw"
          size="sm"
          variant="ghost"
          onPress={onReset}
          label="Reset search"
        />
      )}
    </div>
  );
}
