import { Button } from "@cytario/design";
import { LoaderFunction, useLoaderData } from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import { Section } from "~/components/Container";
import { DescriptionList } from "~/components/DescriptionList";

export const middleware = [authMiddleware];

export const handle = {
  breadcrumb: () => ({ label: "Config", to: "/config" }),
};

export const loader: LoaderFunction = async () => {
  const version = process.env.VERSION ?? "unknown";
  const commitSha = process.env.COMMIT_SHA ?? "unknown";

  return { version, commitSha };
};

export default function ConfigRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <Section>
      <DescriptionList data={data} />
      <Button
        onPress={() => {
          if (confirm("Are you sure you want to clear local storage?")) {
            window.localStorage.clear();
            window.location.reload();
          }
        }}
        variant="destructive"
      >
        Clear Local Storage
      </Button>
      <div>
        {typeof window !== "undefined" && (
          <code className="block bg-slate-100 p-4 overflow-auto">
            {JSON.stringify(localStorage, null, 2)}
          </code>
        )}
      </div>
    </Section>
  );
}
