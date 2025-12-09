import { cloneElement, HTMLAttributes, ReactElement } from "react";
import { twMerge } from "tailwind-merge";

interface InputGroupProps extends HTMLAttributes<HTMLDivElement> {
  children: (ReactElement | null)[];
  className?: string;
}

export const InputGroup = ({
  children,
  className = "",
  ...props
}: InputGroupProps) => {
  const cx = twMerge("flex", className);

  return (
    <div className={cx} {...props}>
      {children.map((child, index) => {
        if (!child) return null;

        const isFirst = index === 0;
        const isLast = index === children.length - 1;

        let additionalClasses = "rounded-none";

        if (isFirst) {
          additionalClasses += " rounded-r-none rounded-l-sm";
        } else if (isLast) {
          additionalClasses += " rounded-l-none rounded-r-sm";
        }

        if (!isLast) {
          additionalClasses += " border-r-0";
        }

        const cx = twMerge(child.props.className, additionalClasses);

        return cloneElement(child, {
          key: index,
          className: cx,
        });
      })}
    </div>
  );
};
