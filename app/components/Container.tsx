import { ReactNode } from "react";

import { H2 } from "./Fonts";

interface LayoutWrapperProps {
  children: ReactNode;
  // theme?: "white"; //
}

export function Section({
  children /* , theme = "white" */,
}: LayoutWrapperProps) {
  return (
    <section
      className={`
        flex-grow 
        bg-white 
        
        py-8 sm:py-12 lg:py-16
      `}
    >
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

// export function Column({ children }: SectionProps) {
//   return (
//     <div className="flex flex-col gap-4 w-full sm:w-2/3 md:w-1/2 lg:w-1/3">
//       {children}
//     </div>
//   );
// }
