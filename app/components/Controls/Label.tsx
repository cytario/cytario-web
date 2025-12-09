import { Label as HeadlessLabel } from "@headlessui/react";
import { ReactNode } from "react";

type LabelProps = React.ComponentProps<typeof HeadlessLabel> & {
  children: ReactNode;
};

export const Label = ({ children, ...props }: LabelProps) => {
  return (
    <HeadlessLabel className="text-sm font-bold text-slate-500" {...props}>
      {children}
    </HeadlessLabel>
  );
};
