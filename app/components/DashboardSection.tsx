import { ButtonLink, H2 } from "@cytario/design";
import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

import { Container, Section } from "~/components/Container";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTableDirectory } from "~/components/DirectoryView/DirectoryViewTableDirectory";
import { type ViewMode } from "~/components/DirectoryView/useLayoutStore";

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
    <Section flush>
      <Container>
        <div className="flex items-center justify-between">
          <H2>{title}</H2>
          <div className="flex items-center gap-3">
            {actions}
            {showAllHref && (
              <ButtonLink href={showAllHref} variant="secondary">
                {hasMore ? `Show all (${nodes.length})` : "View all"}
                <ArrowRight size={16} />
              </ButtonLink>
            )}
          </div>
        </div>
      </Container>
      <Container>
        {viewMode === "list" ? (
          <DirectoryViewTableDirectory nodes={visible} />
        ) : (
          <DirectoryViewGrid nodes={visible} viewMode={viewMode} kind="entries" />
        )}
      </Container>
    </Section>
  );
}
