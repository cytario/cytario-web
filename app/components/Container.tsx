import { H2 } from "@cytario/design";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface SectionProps {
  children: ReactNode;
  className?: string;
}

export function Section({ children, className }: SectionProps) {
  const cx = twMerge(`grow bg-background py-8 sm:py-12 lg:py-16`, className);
  return <section className={cx}>{children}</section>;
}

interface ContainerProps {
  children: ReactNode;
}

export const Container = ({ children }: ContainerProps) => {
  return <div className="container mx-auto px-4">{children}</div>;
};

interface SectionHeaderProps {
  name: string;
  children?: ReactNode;
  contextMenu?: ReactNode;
}

export function SectionHeader({ name, children, contextMenu }: SectionHeaderProps) {
  return (
    <Container>
      <header className="flex flex-wrap items-center justify-between gap-2 mb-12">
        <div className="flex grow items-center gap-2">
          <H2>{name}</H2>
          {contextMenu}
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </header>
    </Container>
  );
}
