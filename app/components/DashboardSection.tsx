import { ReactNode } from "react";
import { Link } from "react-router";

import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTable } from "~/components/DirectoryView/DirectoryViewTable";
import { type ViewMode } from "~/components/DirectoryView/useDirectoryStore";
import { H2 } from "~/components/Fonts";

interface DashboardSectionProps {
  title: string;
  nodes: TreeNode[];
  viewMode: ViewMode;
  maxItems: number;
  showAllHref?: string;
  actions?: ReactNode;
}

export function DashboardSection({
  title,
  nodes,
  viewMode,
  maxItems,
  showAllHref,
  actions,
}: DashboardSectionProps) {
  if (nodes.length === 0) {
    return null;
  }

  const visible = nodes.slice(0, maxItems);
  const hasMore = nodes.length > maxItems;

  return (
    <Section>
      <Container>
        <div className="flex items-center justify-between">
          <H2>{title}</H2>
          <div className="flex items-center gap-3">
            {actions}
            {hasMore && showAllHref && (
              <Link
                to={showAllHref}
                className="text-sm text-cytario-turquoise-700 hover:underline"
              >
                Show all ({nodes.length})
              </Link>
            )}
          </div>
        </div>
      </Container>
      <div className="mt-8">
        {viewMode === "list" ? (
          <Container>
            <DirectoryViewTable nodes={visible} />
          </Container>
        ) : (
          <Container>
            <DirectoryViewGrid nodes={visible} viewMode={viewMode} />
          </Container>
        )}
      </div>
    </Section>
  );
}
