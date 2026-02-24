import { Link, Outlet, useLocation, useSearchParams } from "react-router";

import { Container, Section } from "~/components/Container";
import { H1 } from "~/components/Fonts";

function NavToggle({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex items-center justify-center px-3 h-8 text-sm font-medium border border-slate-300 ${
        active
          ? "bg-slate-700 text-white"
          : "bg-white hover:bg-slate-300"
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
        <header className="flex flex-col justify-between mb-8 gap-2">
          <div className="flex gap-2">
            <H1 className="flex-grow">{scope}</H1>
            <nav className="flex gap-1">
              <NavToggle
                to={`/admin/users?scope=${encodeURIComponent(scope)}`}
                label="Users"
                active={pathname.startsWith("/admin/users")}
              />
              <NavToggle
                to={`/admin/groups?scope=${encodeURIComponent(scope)}`}
                label="Groups"
                active={pathname.startsWith("/admin/groups")}
              />
            </nav>
          </div>
        </header>
      </Container>
      <Outlet />
    </Section>
  );
}
