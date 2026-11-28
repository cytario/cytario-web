import { type ReactNode, useEffect, useRef } from "react";
import { Link } from "react-router";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeIcon } from "~/components/DirectoryView/NodeLink/NodeIcon";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { LockedConnectionPill } from "~/components/Pills/LockedConnectionPill";
import { useActiveOrg } from "~/hooks/useOrgPath";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { buildConnectionPath } from "~/utils/resourceId";

interface GridItemProps {
  node: TreeNode;
  preview?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function GridItem({ node, preview, children, className }: GridItemProps) {
  const activeOrg = useActiveOrg();
  const to = buildConnectionPath(node.connectionId, node.pathName, activeOrg);
  const contextMenuRef = useRef<((event: React.MouseEvent) => void) | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    previewRef.current?.querySelectorAll("[tabindex]").forEach((el) => {
      (el as HTMLElement).tabIndex = -1;
    });
  }, [node]);

  const cx = `
    group flex flex-col overflow-hidden rounded-xl
    bg-background
    border border-border
    transition-all
    hover:border-ring
    focus-visible:outline-none
    focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
  `;

  // A locked card is shown but not a link: the gate refuses browsing it, so a
  // link would only offer a 402. Its context menu (delete included) survives.
  const locked = node.isLocked === true;
  const lockedConnection = useConnectionsStore(select.lockedConnection(node.connectionId));

  const body = (
    <>
      <div ref={previewRef} className="shrink-0 overflow-hidden bg-card aspect-4/3 rounded-t-lg ">
        {preview ?? (
          <div className="flex h-full w-full items-center justify-center">
            <NodeIcon node={node} size="xl" />
          </div>
        )}
      </div>

      <div
        className={`
          flex flex-col
          p-2 gap-1
          border-t border-border
        `}
      >
        <NodeLink
          node={node}
          isClickable={() => false}
          onContextMenuTarget={(handler) => {
            contextMenuRef.current = handler;
          }}
        />
        {(locked || children) && (
          <div className="flex items-center gap-2">
            {locked && <LockedConnectionPill locked={lockedConnection} />}
            {children}
          </div>
        )}
      </div>
    </>
  );

  if (locked) {
    return (
      <div
        className={twMerge(cx, "opacity-60", className)}
        onContextMenu={(e) => contextMenuRef.current?.(e)}
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      to={to}
      className={twMerge(cx, className)}
      onContextMenu={(e) => contextMenuRef.current?.(e)}
    >
      {body}
    </Link>
  );
}
