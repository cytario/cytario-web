import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tree,
  type TreeApi,
  type TreeNode as DesignTreeNode,
} from "@cytario/design";
import { HardDrive, Home, Menu as MenuIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import {
  toDesignTreeNodes,
  findOriginalNode,
} from "~/components/DirectoryView/DirectoryViewTree";
import { useIndexTree } from "~/hooks/useIndexTree";
import { select, useConnectionsStore } from "~/utils/connectionsStore";
import { nodeToPath } from "~/utils/resourceId";

export function GlobalNavigation() {
  const connections = useConnectionsStore(select.connections);

  const root: TreeNode = useMemo(() => {
    const buckets: TreeNode[] = Object.entries(connections).map(
      ([alias, record]) => ({
        connectionName: alias,
        provider: record.connectionConfig.provider,
        bucketName: record.connectionConfig.bucketName,
        name: alias,
        type: "bucket" as const,
        children: [],
      }),
    );

    return {
      connectionName: "",
      provider: "",
      bucketName: "",
      name: "Storage",
      type: "directory",
      children: buckets,
    };
  }, [connections]);

  const navigate = useNavigate();
  const populated = useIndexTree(root);
  const buckets = useMemo(() => populated.children ?? [], [populated.children]);

  const treeData = useMemo(() => toDesignTreeNodes(buckets), [buckets]);
  const treeRef = useRef<TreeApi<DesignTreeNode>>(null);

  const rowHeight = 32;
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const treeHeight = (visibleCount ?? treeData.length) * rowHeight;

  const handleToggle = useCallback(() => {
    requestAnimationFrame(() => {
      if (treeRef.current) {
        setVisibleCount(treeRef.current.visibleNodes.length);
      }
    });
  }, []);

  return (
    <Popover>
      <PopoverTrigger>
        <span
          role="button"
          className="inline-flex items-center justify-center shrink-0 w-8 h-8 rounded-md text-white hover:bg-white/15 active:bg-white/20 cursor-pointer"
          aria-label="Global Menu"
        >
          <MenuIcon size={18} />
        </span>
      </PopoverTrigger>

      <PopoverContent
        placement="bottom start"
        className="min-w-72 max-h-[calc(100vh-4rem)] overflow-y-auto p-2"
      >
        <nav className="flex flex-col gap-1">
          <NavLink href="/" icon={<Home size={16} />} label="Home" />
          <NavLink
            href="/connections"
            icon={<HardDrive size={16} />}
            label="Connections"
          />

          {treeData.length > 0 && (
            <>
              <hr className="border-(--color-border-default) my-1" />
              <span className="text-xs font-medium text-(--color-text-muted) px-2 py-1">
                Storage
              </span>
              <Tree
                aria-label="Storage"
                data={treeData}
                treeRef={treeRef}
                selectionMode="none"
                openByDefault={false}
                size="compact"
                height={treeHeight}
                className="overflow-visible"
                onToggle={handleToggle}
                onActivate={(designNode) => {
                  const original = findOriginalNode(buckets, designNode.id);
                  if (!original) return;
                  navigate(nodeToPath(original));
                }}
              />
            </>
          )}
        </nav>
      </PopoverContent>
    </Popover>
  );
}

function NavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={href}
      className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-(--color-text-default) hover:bg-(--color-surface-secondary) transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}
