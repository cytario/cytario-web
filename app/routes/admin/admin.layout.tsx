import { Link, Outlet, useLocation, useSearchParams } from "react-router";

import { Container, Section } from "~/components/Container";
import { H1 } from "~/components/Fonts";

function NavTab({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={`px-3 py-1 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-cytario-turquoise-700 text-cytario-turquoise-700"
          : "border-transparent text-slate-500 hover:text-slate-700"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AdminLayout() {
  const [searchParams] = useSearchParams();
  const scope = searchParams.get("scope") ?? "";
  const { pathname } = useLocation();

  return (
    <Section>
      <Container>
        <div className="flex items-center justify-between mb-6">
          <H1 className="font-bold text-2xl">{scope}</H1>
          <nav className="flex gap-1">
            <NavTab
              to={`/admin/users?scope=${encodeURIComponent(scope)}`}
              label="Users"
              active={pathname.startsWith("/admin/users")}
            />
            <NavTab
              to={`/admin/groups?scope=${encodeURIComponent(scope)}`}
              label="Groups"
              active={pathname.startsWith("/admin/groups")}
            />
          </nav>
        </div>
      </Container>
      <Outlet />
    </Section>
  );
}
