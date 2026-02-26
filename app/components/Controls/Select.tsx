import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { Icon } from "./Button/Icon";
import {
  baseStyle,
  heightStyles,
  listboxButtonStyle,
  listboxChevronSizes,
  listboxOptionStyle,
  listboxOptionsStyle,
  textStyles,
} from "./styles";
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
  renderOption?: (option: SelectOption) => ReactNode;
};

export const Select = ({
  options,
  value,
  onChange,
  name,
  disabled,
  scale = "large",
  className,
  renderOption,
}: SelectProps) => {
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Listbox value={value} onChange={onChange} name={name} disabled={disabled}>
      <ListboxButton
        className={twMerge(
          baseStyle,
          heightStyles[scale],
          textStyles[scale],
          listboxButtonStyle,
          className,
        )}
      >
        <span className="min-w-0 flex-1 px-2">
          <TooltipSpan>{selectedOption?.label ?? value}</TooltipSpan>
        </span>
        <Icon
          icon="ChevronDown"
          size={listboxChevronSizes[scale].size}
          className={twMerge(
            "flex items-center justify-center h-full",
            listboxChevronSizes[scale].className,
          )}
        />
      </ListboxButton>

      <ListboxOptions
        anchor="bottom start"
        className={twMerge(listboxOptionsStyle, textStyles[scale])}
      >
        {options.map((option) => (
          <ListboxOption
            key={option.value}
            value={option.value}
            className={listboxOptionStyle}
          >
            {renderOption ? (
              <span className="flex w-full items-center">{renderOption(option)}</span>
            ) : (
              option.label
            )}
          </ListboxOption>
        ))}
      </ListboxOptions>
    </Listbox>
  );
};
