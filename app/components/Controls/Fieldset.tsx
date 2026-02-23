import { Fieldset as HeadlessFieldset } from "@headlessui/react";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export const Fieldset = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => {
  const cx = twMerge("flex flex-col gap-4", className);
  return <HeadlessFieldset className={cx}>{children}</HeadlessFieldset>;
};
