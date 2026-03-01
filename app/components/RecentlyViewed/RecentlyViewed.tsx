import { Container, Section } from "~/components/Container";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTable } from "~/components/DirectoryView/DirectoryViewTable";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { H2 } from "~/components/Fonts";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

export function RecentlyViewed() {
  const nodes = useRecentlyViewedStore((state) => state.items);
  const { viewMode } = useLayoutStore();

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Section>
      <Container>
        <H2>Recently Viewed</H2>
      </Container>
      <div className="mt-4">
        {viewMode === "list" || viewMode === "list-wide" ? (
          <DirectoryViewTable nodes={nodes} />
        ) : (
          <Container>
            <DirectoryViewGrid nodes={nodes} viewMode={viewMode} />
          </Container>
        )}
      </div>
    </Section>
  );
}
