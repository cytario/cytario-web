import { Description, Field as HeadlessField } from "@headlessui/react";
import { ReactNode } from "react";
import { FieldError } from "react-hook-form";
import { twMerge } from "tailwind-merge";

import { Label } from "./Label";

export const Field = ({
  children,
  label,
  description,
  error,
  inline = false,
}: {
  children: ReactNode;
  label: string;
  description?: string;
  error?: FieldError;
  inline?: boolean;
}) => {
  const cx = twMerge("flex gap-2 text-sm", inline ? "flex-row" : "flex-col");
  return (
    <HeadlessField className={cx}>
      <div className="space-y-1">
        <Label>{label}</Label>
        {description && <Description>{description}</Description>}
      </div>
      <div className="space-y-1">
        {children}
        {error && <p className="text-sm text-rose-700">{error.message}</p>}
      </div>
    </HeadlessField>
  );
};
