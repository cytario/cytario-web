import { IconButton, Input } from "@cytario/design";
import { X } from "lucide-react";

type SearchBarProps = Readonly<{
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}>;

export function SearchBar({ value, onChange, onClear }: SearchBarProps) {
  return (
    <div className="flex">
      <Input
        value={value}
        onChange={onChange}
        onFocus={() => onChange(value)}
        placeholder="Search..."
      />

      {value ? (
        <IconButton
          icon={X}
          onPress={onClear}
          aria-label="Clear search"
        />
      ) : null}
    </div>
  );
}
