import { type ReactNode } from "react";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeIcon } from "~/components/NodeLink/NodeIcon";
import { NodeLink } from "~/components/NodeLink/NodeLink";

interface GridItemProps {
  node: TreeNode;
  preview?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const cx = `
  group flex flex-col overflow-hidden rounded-lg
  border border-(--color-border-default)
  shadow-sm transition-all
  hover:border-(--color-border-focus) hover:shadow-md
`;

/**
 * Generic grid item composed of a preview slot on top, a `NodeLink` row in the
 * middle, and an optional meta row at the bottom. Replaces type-specific
 * `StorageConnectionCard` / `FileCard` usages from `@cytario/design`; the card
 * chrome (border, shadow, hover) lives here so we can iterate without
 * round-tripping through the design-system package.
 */
export function GridItem({ node, preview, children, className }: GridItemProps) {
  return (
    <div className={twMerge(cx, className)}>
      <div className="shrink-0 overflow-hidden bg-neutral-900 aspect-4/3 rounded-t-lg">
        {preview ?? (
          <div className="flex h-full w-full items-center justify-center">
            <NodeIcon node={node} size={32} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 border-t border-(--color-border-default) bg-(--color-surface-default) px-3 py-2 rounded-b-lg">
        <NodeLink node={node} />
        {children && (
          <div className="flex items-center gap-2 pl-6 text-xs text-(--color-text-secondary)">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
