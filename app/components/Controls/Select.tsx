import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { twMerge } from "tailwind-merge";

import { Icon } from "./Button/Icon";
import { baseStyle, heightStyles, textStyles } from "./styles";
import { TooltipSpan } from "../Tooltip/TooltipSpan";

type SelectOption = { label: string; value: string };

type SelectProps = {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  scale?: "small" | "medium" | "large";
  className?: string;
};

const iconSizes = {
  small: { size: 14 as const, className: "w-6" },
  medium: { size: 16 as const, className: "w-8" },
  large: { size: 20 as const, className: "w-12" },
};

export const Select = ({
  options,
  value,
  onChange,
  name,
  disabled,
  scale = "large",
  className,
}: SelectProps) => {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} name={name} disabled={disabled}>
      <ListboxButton
        className={twMerge(
          baseStyle,
          heightStyles[scale],
          textStyles[scale],
          "items-center border-slate-300 text-left overflow-hidden min-w-0",
          className,
        )}
      >
        <span className="min-w-0 flex-1 px-2">
          <TooltipSpan>{selectedOption?.label ?? value}</TooltipSpan>
        </span>
        <Icon
          icon="ChevronDown"
          size={iconSizes[scale].size}
          className={twMerge(
            "flex items-center justify-center h-full",
            iconSizes[scale].className,
          )}
        />
      </ListboxButton>

      <ListboxOptions
        anchor="bottom start"
        className={twMerge(
          "z-20 min-w-[var(--button-width)] w-max border border-slate-300 bg-white rounded-sm",
          textStyles[scale],
        )}
      >
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className="cursor-pointer data-[focus]:bg-slate-100 px-2 py-1"
          >
            {option.label}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
};
