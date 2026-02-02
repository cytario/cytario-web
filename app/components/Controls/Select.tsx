import { Select as HeadlessSelect } from "@headlessui/react";
import { forwardRef, ReactNode } from "react";

type SelectProps = React.ComponentProps<typeof HeadlessSelect> &
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    children: ReactNode;
  };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ children, ...props }, ref) => {
    return (
      <HeadlessSelect
        ref={ref}
        {...props}
        className={`
        h-12 text-lg
        border-slate-300
        flex w-full border rounded-sm
        transition duration-100 ease-in
        disabled:opacity-50 disabled:cursor-not-allowed
        px-2
      `}
      >
        {children}
      </HeadlessSelect>
    );
  },
);

Select.displayName = "Select";
