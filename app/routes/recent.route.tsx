import { useMemo } from "react";
import { type MetaFunction, useSearchParams } from "react-router";

import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTable } from "~/components/DirectoryView/DirectoryViewTable";
import { useDirectoryStore } from "~/components/DirectoryView/useDirectoryStore";
import { ViewModeToggle } from "~/components/DirectoryView/ViewModeToggle";
import { H1 } from "~/components/Fonts";
import { Placeholder } from "~/components/Placeholder";
import { getFileType } from "~/utils/fileType";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

export const meta: MetaFunction = () => [{ title: "Recent — Cytario" }];

const IMAGE_TYPES = new Set(["TIFF", "OME-TIFF", "PNG", "JPEG"]);

type FilterType = "all" | "images" | "directories" | "files";

const filterLabels: Record<FilterType, string> = {
  all: "All Recent",
  images: "Recent Images",
  directories: "Recent Directories",
  files: "Recent Files",
};

function filterNodes(nodes: TreeNode[], filter: FilterType): TreeNode[] {
  switch (filter) {
    case "images":
      return nodes.filter(
        (n) => n.type === "file" && IMAGE_TYPES.has(getFileType(n.name)),
      );
    case "directories":
      return nodes.filter((n) => n.type === "directory");
    case "files":
      return nodes.filter(
        (n) => n.type === "file" && !IMAGE_TYPES.has(getFileType(n.name)),
      );
    default:
      return nodes;
  }
}

function RecentContent() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (searchParams.get("filter") as FilterType) || "all";
  const { viewMode } = useDirectoryStore();
  const allItems = useRecentlyViewedStore((state) => state.items);

  const filtered = useMemo(
    () => filterNodes(allItems, filter),
    [allItems, filter],
  );

  const filters: FilterType[] = ["all", "images", "directories", "files"];

  return (
    <Section>
      <Container>
        <div className="flex items-center justify-between">
          <H1>{filterLabels[filter]}</H1>
          <ViewModeToggle />
        </div>
        <nav className="mt-4 flex gap-2" aria-label="Filter recent items">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                if (f === "all") {
                  params.delete("filter");
                } else {
                  params.set("filter", f);
                }
                setSearchParams(params);
              }}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                filter === f
                  ? "bg-cytario-turquoise-700 text-white border-cytario-turquoise-700"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </nav>
      </Container>

      {filtered.length > 0 ? (
        <div className="mt-8">
          {viewMode === "list" || viewMode === "list-wide" ? (
            <Container wide={viewMode === "list-wide"}>
              <DirectoryViewTable nodes={filtered} />
            </Container>
          ) : (
            <Container>
              <DirectoryViewGrid nodes={filtered} viewMode={viewMode} />
            </Container>
          )}
        </div>
      ) : (
        <Placeholder
          icon="Clock"
          title="No recent items"
          description="Items you view or browse will appear here."
        />
      )}
    </Section>
  );
}

export default function RecentRoute() {
  return <RecentContent />;
}
