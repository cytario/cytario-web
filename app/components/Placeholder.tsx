import { ReactNode } from "react";

import { Icon, type LucideIconsType } from "./Controls";
import { H2 } from "./Fonts";

export function Placeholder({
  title,
  description,
  icon,
  cta,
}: {
  title: string;
  description: string;
  icon?: LucideIconsType;
  cta?: ReactNode;
}) {
  return (
    <div className="h-full p-2 flex flex-col grow items-center justify-center">
      <header className="flex flex-col items-center gap-4">
        {icon && <Icon icon={icon} size={96} strokeWidth={3} />}
        <H2>{title}</H2>
      </header>
      <p className="text-slate-500 text-center">{description}</p>
      {cta && <footer className="flex flex-col gap-2 m-4">{cta}</footer>}
    </div>
  );
}
