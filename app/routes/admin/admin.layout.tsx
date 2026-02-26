import { Outlet, useSearchParams } from "react-router";

import { Container, Section } from "~/components/Container";
import { H1 } from "~/components/Fonts";

export default function AdminLayout() {
  const [searchParams] = useSearchParams();
  const scope = searchParams.get("scope") ?? "";

  return (
    <Section>
      <Container>
        <header className="mb-2">
          <p className="text-sm text-slate-500">Admin</p>
          <H1>{scope}</H1>
        </header>
      </Container>
      <Outlet />
    </Section>
  );
}
