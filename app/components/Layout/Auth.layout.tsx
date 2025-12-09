import { ReactNode } from "react";

import { Link } from "~/components/Link";
import { Logo } from "~/components/Logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-grow flex-col p-4 gap-8 items-center justify-between bg-slate-50">
      <header>
        <Link to="/login">
          <Logo scale={2} />
        </Link>
      </header>

      <main
        className="flex items-center justify-center rounded-full border"
        style={{ width: 520, height: 520 }}
      >
        <div className="relative flex flex-col items-center w-1/3 min-w-80 max-w-sm gap-4">
          {children}
        </div>
      </main>

      <footer>
        <Link to="https://www.cytario.com">www.cytario.com</Link>
      </footer>
    </div>
  );
}
