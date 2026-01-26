import { ReactNode } from "react";

interface ContainerProps {
  children: ReactNode;
}

export function Container({ children }: ContainerProps) {
  return (
    <section className="container flex-grow mx-auto my-12 px-6">
      <div className="">{children}</div>
    </section>
  );
}

export function Column({ children }: ContainerProps) {
  return (
    <div className="flex flex-col gap-4 w-full sm:w-2/3 md:w-1/2 lg:w-1/3">
      {children}
    </div>
  );
}
