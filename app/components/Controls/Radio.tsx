import { Radio as HeadlessRadio } from "@headlessui/react";
import { ReactNode } from "react";

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
      <span className="">{children}</span>
    </HeadlessRadio>
  );
};
