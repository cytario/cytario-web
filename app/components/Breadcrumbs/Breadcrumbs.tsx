import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
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
    <div className="flex h-full items-center overflow-hidden">
      <Link to="/" aria-label="Go to home" className="flex items-center h-full px-2">
        <Logo scale={1.4} />
      </Link>
      {trail.map((node, index) => {
        const isLeaf = index === trail.length - 1;
        return (
          <Fragment key={node.id}>
            {index > 0 && (
              <ChevronRight
                size={16}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            )}
            <NodeLink node={node} contextMenu={isLeaf} />
          </Fragment>
        );
      })}
    </div>
  );
}
