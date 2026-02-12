import { Fieldset as HeadlessFieldset } from "@headlessui/react";
import { ReactNode } from "react";

export const Fieldset = ({ children }: { children: ReactNode }) => {
  return (
    <HeadlessFieldset className="flex flex-col gap-8">
      {children}
    </HeadlessFieldset>
  );
};
