import { Field as HeadlessField } from "@headlessui/react";
import { ReactNode } from "react";
import { FieldError } from "react-hook-form";

import { Label } from "./Label";

export const Field = ({
  children,
  label,
  description,
  error,
}: {
  children: ReactNode;
  label: string;
  description?: string;
  error?: FieldError;
}) => {
  return (
    <HeadlessField className="flex flex-col gap-1 text-slate-500 text-sm">
      <Label>{label}</Label>
      {description && <p>{description}</p>}
      {children}
      {error && <p className="text-sm text-rose-600">{error.message}</p>}
    </HeadlessField>
  );
};
