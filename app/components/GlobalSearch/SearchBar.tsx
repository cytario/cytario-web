import { IconButton } from "@cytario/design";
import { X } from "lucide-react";

import { Input } from "../Controls";

type SearchBarProps = Readonly<{
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}>;

export function SearchBar({ value, onChange, onClear }: SearchBarProps) {
  return (
    <div className="flex">
      <Input
        theme="dark"
        type="search"
        value={value}
        onChange={onChange}
        onFocus={onChange}
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
