import { ButtonLink } from "@cytario/design";
import { ArrowRight } from "lucide-react";

import { Container, Section, SectionHeader } from "~/components/Container";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewGrid } from "~/components/DirectoryView/DirectoryViewGrid";
import { DirectoryViewTableDirectory } from "~/components/DirectoryView/DirectoryViewTableDirectory";
import { type ViewMode } from "~/components/DirectoryView/useLayoutStore";

interface DashboardSectionProps {
  title: string;
  nodes: TreeNode[];
  viewMode: ViewMode;
  maxItems: number;
  to: string;
}

export function DashboardSection({ title, nodes, viewMode, maxItems, to }: DashboardSectionProps) {
  // Don't render the section at all if there are no items to show.
  if (nodes.length === 0) {
    return null;
  }

  const visible = nodes.slice(0, maxItems);
  const kind = nodes[0].type === "bucket" ? "connections" : "entries";

  return (
    <Section>
      <SectionHeader name={title}>
        <ButtonLink href={to} variant="secondary" size="sm">
          View all
          <ArrowRight size={16} />
        </ButtonLink>
      </SectionHeader>

      <Container>
        {viewMode === "list" ? (
          <DirectoryViewTableDirectory nodes={visible} />
        ) : (
          <DirectoryViewGrid nodes={visible} kind={kind} />
        )}
      </Container>
    </Section>
  );
}
