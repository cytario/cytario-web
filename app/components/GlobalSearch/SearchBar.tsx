import { IconButton } from "../Controls/IconButton";
import { Input } from "../Controls/Input";

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
        <IconButton icon="X" onClick={onClear} label="Clear search" />
      ) : null}
    </div>
  );
}
