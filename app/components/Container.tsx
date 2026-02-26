import { ReactNode } from "react";

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

// export function Column({ children }: SectionProps) {
//   return (
//     <div className="flex flex-col gap-4 w-full sm:w-2/3 md:w-1/2 lg:w-1/3">
//       {children}
//     </div>
//   );
// }
