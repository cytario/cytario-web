import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";

import { Icon } from "./Button/Icon";

type SelectOption = { label: string; value: string };

type SelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
};

export const Select = ({
  options,
  value,
  onChange,
  name,
  disabled,
}: SelectProps) => {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} name={name} disabled={disabled}>
      <ListboxButton
        className={`
          h-12 text-lg
          border-slate-300
          flex w-full items-center border rounded-sm
          transition duration-100 ease-in
          disabled:opacity-50 disabled:cursor-not-allowed
          text-left
        `}
      >
        <span className="w-full px-2">{selectedOption?.label ?? value}</span>
        <Icon
          icon="ChevronDown"
          size={20}
          className={`
            flex items-center justify-center
            w-12 h-full
          `}
        />
      </ListboxButton>

      <ListboxOptions
        anchor="bottom"
        className="w-[var(--button-width)] border border-slate-300 bg-white rounded-sm"
      >
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className="px-2 py-2 text-lg cursor-pointer data-[focus]:bg-blue-100"
          >
            {option.label}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
};
