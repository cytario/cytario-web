import { Label as HeadlessLabel } from "@headlessui/react";
import { ReactNode } from "react";

type LabelProps = React.ComponentProps<typeof HeadlessLabel> & {
  children: ReactNode;
  description?: string;
};

export const Label = ({ children, ...props }: LabelProps) => {
  return (
    <HeadlessLabel className="font-bold" {...props}>
      {children}
    </HeadlessLabel>
  );
};
