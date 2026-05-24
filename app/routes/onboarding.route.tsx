import { ButtonLink } from "@cytario/design";
import { type MetaFunction } from "react-router";

export const meta: MetaFunction = () => [{ title: "Welcome to Cytario" }];

export default function OnboardingRoute() {
  return (
    <main className="flex h-screen items-center justify-center bg-neutral-0 px-6">
      <section className="flex max-w-xl flex-col items-start gap-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">
          Welcome to Cytario
        </h1>
        <p className="text-slate-600 dark:text-slate-300">
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
