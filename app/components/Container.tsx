import { ReactNode } from "react";

interface LayoutWrapperProps {
  children: ReactNode;
}

export function Section({ children }: LayoutWrapperProps) {
  return (
    <section
      className={`
        flex-grow 
        bg-gradient-to-br from-white to-slate-200 
        py-8 sm:py-12 lg:py-16
      `}
    >
      {children}
    </section>
  );
}

export const Container = ({ children }: LayoutWrapperProps) => {
  return <div className="container mx-auto px-4"> {children}</div>;
};

// export function Column({ children }: SectionProps) {
//   return (
//     <div className="flex flex-col gap-4 w-full sm:w-2/3 md:w-1/2 lg:w-1/3">
//       {children}
//     </div>
//   );
// }
