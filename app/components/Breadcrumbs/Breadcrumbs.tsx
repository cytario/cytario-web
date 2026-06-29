import { Icon } from "@cytario/design";
import { Link, UIMatch, useMatches } from "react-router";

import { nodeToTrail } from "./breadcrumbTrail";
import { type TreeNode } from "../DirectoryView/buildDirectoryTree";
import { NodeLink } from "../DirectoryView/NodeLink/NodeLink";
import { Logo } from "../Logo";

type NodeMatch = UIMatch<unknown, { node?: (match: NodeMatch) => TreeNode | null }>;

export function Breadcrumbs() {
  const matches = useMatches() as NodeMatch[];

  const trail: TreeNode[] = matches
    .filter((match) => typeof match.handle?.node === "function")
    .flatMap((match) => {
      const node = match.handle.node!(match);
      return node ? nodeToTrail(node) : [];
    });

  return (
    <nav aria-label="Breadcrumb" className="flex h-full items-center overflow-hidden">
      <Link to="/" aria-label="Go to home" className="flex items-center h-full px-2">
        <Logo scale={1.4} />
      </Link>
      <ol className="flex min-w-0 items-center">
        {trail.map((node, index) => {
          const isLeaf = index === trail.length - 1;
          return (
            <li
              key={node.id}
              className="flex min-w-0 items-center"
              aria-current={isLeaf ? "page" : undefined}
            >
              {index > 0 && (
                <Icon icon="ChevronRight" size="sm" className="text-muted-foreground" />
              )}
              <NodeLink node={node} contextMenu={isLeaf} />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
