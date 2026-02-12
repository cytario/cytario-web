import { Description, Field as HeadlessField } from "@headlessui/react";
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
    <HeadlessField className="space-y-4 text-sm">
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
