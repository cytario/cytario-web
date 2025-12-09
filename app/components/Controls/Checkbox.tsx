import { Checkbox as HeadlessCheckbox, CheckboxProps } from "@headlessui/react";
import { Check } from "lucide-react";
import { ReactElement } from "react";

const cx = `
  group/checkbox
  flex overflow-hidden place-items-center flex-shrink-0 
  size-6 rounded-sm p-1 
  border border-slate-300 
  bg-white data-[checked]:bg-cytario-turquoise-500
  hover:bg-slate-100 hover:data-[checked]:bg-cytario-turquoise-700
`;

export const Checkbox = ({ ...props }: CheckboxProps) => {
  return (
    <HeadlessCheckbox {...props} className={cx}>
      {({ checked }) =>
        checked ? (
          <Check
            strokeWidth={2}
            className={`
              fill-none stroke-slate-700
              group-data-[checked]/checkbox:stroke-white 
            `}
          />
        ) : (
          (null as unknown as ReactElement)
        )
      }
    </HeadlessCheckbox>
  );
};
