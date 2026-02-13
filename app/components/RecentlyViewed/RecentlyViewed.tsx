import { Container, Section } from "~/components/Container";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTable } from "~/components/DirectoryView/DirectoryViewTable";
import { useDirectoryStore } from "~/components/DirectoryView/useDirectoryStore";
import { H2 } from "~/components/Fonts";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

export function RecentlyViewed() {
  const nodes = useRecentlyViewedStore((state) => state.items);
  const { viewMode } = useDirectoryStore();

  if (nodes.length === 0) {
    return null;
  }

  return (
    <Section>
      <Container>
        <H2>Recently Viewed</H2>
      </Container>
      <div className="mt-4">
        {viewMode === "grid" ? (
          <Container>
            <DirectoryViewGrid nodes={nodes} />
          </Container>
        ) : (
          <DirectoryViewTable nodes={nodes} />
        )}
      </div>
    </Section>
  );
}
