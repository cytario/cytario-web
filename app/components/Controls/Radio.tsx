import { Radio as HeadlessRadio } from "@headlessui/react";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import {
  buttonBaseStyles,
  buttonScaleStyles,
  buttonThemeStyles,
} from "./Button/styles";

export const Radio = ({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) => {
  return (
    <HeadlessRadio
      value={value}
      className="group flex cursor-pointer items-center gap-1"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full border border-slate-500">
        <span className="h-2 w-2 rounded-full bg-cytario-turquoise-500 opacity-0 group-data-[checked]:opacity-100" />
      </span>
      {children}
    </HeadlessRadio>
  );
};

export const RadioButton = ({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) => {
  return (
    <HeadlessRadio
      value={value}
      className={({ checked }) =>
        twMerge(
          buttonBaseStyles,
          buttonScaleStyles.large,
          checked ? buttonThemeStyles.primary : buttonThemeStyles.white,
          checked && "hover:bg-cytario-turquoise-500",
          "group flex cursor-pointer items-center gap-1 w-full",
        )
      }
    >
      {children}
    </HeadlessRadio>
  );
};
