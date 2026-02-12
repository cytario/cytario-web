import { Select as HeadlessSelect } from "@headlessui/react";
import { forwardRef, ReactNode } from "react";

import { Icon } from "./Button/Icon";

type SelectProps = React.ComponentProps<typeof HeadlessSelect> &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: ReactNode;
  };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, ...props }, ref) => {
    return (
      <div className="relative w-full ">
        <HeadlessSelect
          ref={ref}
          className={`
            h-12 text-lg
            border-slate-300
            flex w-full border rounded-sm
            transition duration-100 ease-in
            disabled:opacity-50 disabled:cursor-not-allowed
            appearance-none
            pl-2 pr-12
          `}
          {...props}
        >
          {children}
        </HeadlessSelect>
        <Icon
          icon="ChevronDown"
          size={20}
          className={`
            pointer-events-none
            absolute top-0 right-0
            flex items-center justify-center
            w-12 h-12 
          `}
        />
      </div>
    );
  },
);

Select.displayName = "Select";
