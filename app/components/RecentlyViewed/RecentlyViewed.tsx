import { H2 } from "@cytario/design";

import { Container, Section } from "~/components/Container";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTable } from "~/components/DirectoryView/DirectoryViewTable";
import { useDirectoryStore } from "~/components/DirectoryView/useDirectoryStore";
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
        {viewMode === "list" ? (
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
