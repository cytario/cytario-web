import { ReactNode } from "react";

import { H2 } from "@cytario/design";

interface LayoutWrapperProps {
  children: ReactNode;
}

export function Section({ children }: LayoutWrapperProps) {
  return (
    <section className="flex-grow bg-white py-8 sm:py-12 lg:py-16">
      {children}
    </section>
  );
}

export const Container = ({
  children,
  wide,
}: LayoutWrapperProps & { wide?: boolean }) => {
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
          {name && <H2 className="flex-grow">{name}</H2>}
          {children}
        </div>
      </header>
    </Container>
  );
}
