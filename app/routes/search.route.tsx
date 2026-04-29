import { H1 } from "@cytario/design";
import { type LoaderFunctionArgs, useLoaderData } from "react-router";

import { Section } from "~/components/Container";
import { DirectoryTree } from "~/components/DirectoryView/DirectoryViewTree";
import { useSearchAcrossConnections } from "~/routes/connectionIndex/useSearchAcrossConnections";

export interface SearchRouteLoaderResponse {
  searchQuery: string;
}

export const handle = {
  breadcrumb: () => ({ label: "Search", to: "/search" }),
};

export const loader = ({
  request,
}: LoaderFunctionArgs): SearchRouteLoaderResponse => ({
  searchQuery: new URL(request.url).searchParams.get("query") ?? "",
});

export default function SearchRoute() {
  const { searchQuery } = useLoaderData<typeof loader>();
  const { nodes } = useSearchAcrossConnections(searchQuery);

  return (
    <Section>
      <H1>{`Search: ${searchQuery}`}</H1>
      <div className="bg-slate-100">
        <DirectoryTree nodes={nodes} />
      </div>
    </Section>
  );
}
