import { ButtonLink } from "@cytario/design";
import { type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [{ title: "Welcome to Cytario" }];

export default function OnboardingRoute() {
  return (
    <main className="flex h-screen items-center justify-center bg-background px-6">
      <section className="flex max-w-xl flex-col items-start gap-6">
        <h1 className="text-2xl font-semibold text-foreground">Welcome to Cytario</h1>
        <p className="text-muted-foreground">
          Your account is not yet linked to an organization. An administrator needs to add you
          before you can access workspace data. Once you have been added, sign out and back in to
          activate your organization.
        </p>
        <ButtonLink href="/logout" variant="secondary">
          Sign out
        </ButtonLink>
      </section>
    </main>
  );
}
