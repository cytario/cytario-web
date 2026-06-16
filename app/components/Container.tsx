import { H2 } from "@cytario/design";
import { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

interface SectionProps {
  children: ReactNode;
  className?: string;
}

export function Section({ children, className }: SectionProps) {
  const cx = twMerge(`grow bg-white py-8 sm:py-12 lg:py-16`, className);
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
}

export function SectionHeader({ name, children }: SectionHeaderProps) {
  return (
    <Container>
      <header className="flex flex-wrap items-center justify-between mb-4 gap-2">
        <H2 className="grow">{name}</H2>
        {children}
      </header>
    </Container>
  );
}
