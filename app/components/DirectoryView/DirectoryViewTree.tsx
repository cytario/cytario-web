import { Tree } from "@cytario/design";
import { icons } from "lucide-react";
import { useNavigate } from "react-router";

import { type TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { useLazyTreeNodes } from "./useLazyTreeNodes";
import { getFileTypeIcon } from "~/utils/fileType";
import { buildConnectionPath } from "~/utils/resourceId";

interface DirectoryViewTreeProps {
  /** The full (unfiltered) tree of nodes. Filtering is done via searchTerm. */
  nodes: TreeNode[];
  searchTerm?: string;
  kind: DirectoryKind;
}

export function NodeLinkIcon({ node }: { node: TreeNode }) {
  const iconName = node.type === "file" ? getFileTypeIcon(node.name) : "Folder";
  const resolvedName = node.type === "bucket" ? "Archive" : iconName;
  const IconComponent = icons[resolvedName] ?? icons["File"];

  return (
    <div className="flex items-center justify-center">
      <IconComponent strokeWidth={1.5} size={24} />
    </div>
  );
}

/**
 * Thin wrapper around `@cytario/design`'s `<Tree>` that navigates on row
 * activation.
 *
 * @deprecated Planned for removal as part of tree consolidation — C-150.
 */
export function DirectoryViewTree({
  nodes: initialNodes,
  searchTerm,
  kind,
}: DirectoryViewTreeProps) {
  const navigate = useNavigate();
  const { nodes, loadChildren } = useLazyTreeNodes(initialNodes);

  if (initialNodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

  return (
    <div className="overflow-hidden rounded-[var(--border-radius-md)] border border-[var(--color-border-default)]">
      <Tree
        aria-label="Directory tree"
        data={nodes}
        selectionMode="none"
        openByDefault={false}
        size="comfortable"
        height={600}
        searchTerm={searchTerm}
        searchMatch={(node, term) => node.name.toLowerCase().includes(term.toLowerCase())}
        onToggle={(node) => {
          void loadChildren(node).catch(() => {});
        }}
        onActivate={(node) => navigate(buildConnectionPath(node.connectionName, node.pathName))}
      />
    </div>
  );
}
