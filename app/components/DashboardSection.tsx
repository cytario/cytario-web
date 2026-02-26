import { ReactNode } from "react";

import { ButtonLink, Icon } from "./Controls";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTable } from "~/components/DirectoryView/DirectoryViewTable";
import { type ViewMode } from "~/components/DirectoryView/useLayoutStore";
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
            {showAllHref && (
              <ButtonLink to={showAllHref} theme="white">
                {hasMore ? `Show all (${nodes.length})` : "View all"}
                <Icon icon="ArrowRight" size={16} />
              </ButtonLink>
            )}
          </div>
        </div>
      </Container>
      <Container wide={viewMode === "list-wide"}>
        {viewMode === "list" || viewMode === "list-wide" ? (
          <DirectoryViewTable nodes={visible} />
        ) : (
          <DirectoryViewGrid nodes={visible} viewMode={viewMode} />
        )}
      </Container>
    </Section>
  );
}
