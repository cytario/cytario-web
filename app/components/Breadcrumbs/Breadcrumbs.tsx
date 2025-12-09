import { UIMatch, useMatches } from "react-router";

type BreadcrumbMatch = UIMatch<
  null,
  { breadcrumb: (match: BreadcrumbMatch) => string }
>;

export default function Breadcrumbs() {
  const matches = useMatches() as BreadcrumbMatch[];
  const filteredMatches = matches.filter(
    (match) => match.handle && match.handle.breadcrumb
  );

  return (
    <div className="flex h-full mx-2">
      <ul className="flex overflow-hidden">
        {filteredMatches.map((match) => match.handle.breadcrumb(match))}
      </ul>
    </div>
  );
}
