import { LoaderFunction, useLoaderData } from "react-router";

import { authMiddleware } from "~/.server/auth/authMiddleware";
import { BreadcrumbLink } from "~/components/Breadcrumbs/BreadcrumbLink";
import { Container } from "~/components/Container";
import { Button } from "~/components/Controls";
import { DescriptionList } from "~/components/DescriptionList";

export const middleware = [authMiddleware];

export const handle = {
  breadcrumb: () => {
    return (
      <BreadcrumbLink key="config" to={`/config`}>
        Config
      </BreadcrumbLink>
    );
  },
};

export const loader: LoaderFunction = async () => {
  const version = process.env.VERSION ?? "unknown";
  const commitSha = process.env.COMMIT_SHA ?? "unknown";

  return { version, commitSha };
};

export default function ConfigRoute() {
  const data = useLoaderData<typeof loader>();

  return (
    <Container>
      <DescriptionList data={data} />
      <Button
        onClick={() => {
          if (confirm("Are you sure you want to clear local storage?")) {
            window.localStorage.clear();
            window.location.reload();
          }
        }}
        theme="error"
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
    </Container>
  );
}
