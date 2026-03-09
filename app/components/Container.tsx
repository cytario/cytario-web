import { H2 } from "@cytario/design";
import { ReactNode } from "react";

interface SectionProps {
  children: ReactNode;
  className?: string;
  /** When true, omit default vertical padding (useful inside gap-based layouts) */
  flush?: boolean;
}

export function Section({ children, className, flush }: SectionProps) {
  return (
    <section
      className={`grow bg-white ${flush ? "" : "py-8 sm:py-12 lg:py-16"} ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

export const Container = ({
  children,
  wide,
}: {
  children: ReactNode;
  wide?: boolean;
}) => {
  return (
    <div className={wide ? "mx-auto px-4" : "container mx-auto px-4"}>
      {children}
    </div>
  );
};

export function SectionHeader({
  name,
  children,
}: {
  name: string;
  children?: ReactNode;
}) {
  return (
    <Container>
      <header className="flex flex-col justify-between mb-8 gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {name && <H2 className="grow">{name}</H2>}
          {children}
        </div>
      </header>
    </Container>
  );
}
