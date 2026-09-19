import { IconButton } from "@cytario/design";
import { asyncDataLoaderFeature, hotkeysCoreFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { nodePassesFilters, type TreeFilters } from "./treeFilters";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { useConnectionTreeStore } from "~/utils/connectionsStore/useConnectionTreeStore";

interface DirectoryViewTreeProps {
  nodes: TreeNode[];
  kind: DirectoryKind;
  nodeLinkProps?: Omit<React.ComponentProps<typeof NodeLink>, "node">;
  /** Called when a lazy stub (`loadState === "idle"`) is expanded. Omit for static trees. */
  onExpand?: (parent: TreeNode) => Promise<TreeNode[]>;
  /** Items expanded when the tree first mounts. */
  defaultExpandedItems?: string[];
  /** Ancestor ids to reveal reactively — unioned into the expanded set as they change. */
  revealItems?: string[];
  filters?: TreeFilters;
  nodeFilter?: (node: TreeNode) => boolean;
}

const ROOT_ID = "__directory_tree_root__";
const noopOnExpand = async (): Promise<TreeNode[]> => [];

export function DirectoryViewTree({
  nodes: initialNodes,
  kind,
  onExpand = noopOnExpand,
  defaultExpandedItems,
  revealItems,
  nodeLinkProps,
  filters,
  nodeFilter,
}: DirectoryViewTreeProps) {
  const nodesById = useRef<Map<string, TreeNode>>(new Map());
  const [expandedItems, setExpandedItems] = useState<string[]>(defaultExpandedItems ?? []);

  // Lazy trees prime their index from the tree cache so previously expanded
  // levels resolve instantly after remount; static (search-result) trees use
  // their props alone to avoid id collisions.
  const isLazyTree = initialNodes.some((n) => n.loadState === "idle");
  const connectionId = initialNodes[0]?.connectionId;
  const cachedLevels = useConnectionTreeStore((s) =>
    isLazyTree && connectionId ? s.levels[connectionId] : undefined,
  );
  useEffect(() => {
    if (!cachedLevels) return;
    for (const entry of cachedLevels.values()) {
      // Raw-only entries (warmed by the search walk) have no nodes yet.
      if (!entry.nodes) continue;
      for (const n of entry.nodes) nodesById.current.set(n.id, n);
    }
  }, [cachedLevels]);

  // Union revealItems into the expanded set without disturbing manual
  // expansions; the async loader cascade-loads each newly-expanded level.
  // Adjust-state-during-render so the reveal lands in the same commit as the route change.
  const [prevReveal, setPrevReveal] = useState(revealItems);
  if (revealItems !== prevReveal) {
    setPrevReveal(revealItems);
    if (revealItems?.length) {
      setExpandedItems((prev) => {
        const next = new Set(prev);
        const before = next.size;
        for (const id of revealItems) next.add(id);
        return next.size === before ? prev : Array.from(next);
      });
    }
  }

  const tree = useTree<TreeNode>({
    rootItemId: ROOT_ID,
    state: { expandedItems },
    setExpandedItems,
    getItemName: (item) => item.getItemData()?.name ?? "",
    isItemFolder: (item) => {
      const data = item.getItemData();
      if (!data) return false;
      if (data.isLeaf) return false;
      return data.type !== "file";
    },
    dataLoader: {
      getItem: (id) => {
        const cached = nodesById.current.get(id);
        if (!cached) throw new Error(`DirectoryViewTree: unknown item id "${id}"`);
        return cached;
      },
      getChildrenWithData: async (id) => {
        if (id === ROOT_ID) {
          for (const n of initialNodes) nodesById.current.set(n.id, n);
          return initialNodes.map((n) => ({ id: n.id, data: n }));
        }
        const parent = nodesById.current.get(id);
        if (!parent) return [];
        // `loadState === "idle"` marks a lazy stub; everything else uses embedded children.
        const fetched =
          parent.loadState === "idle" ? await onExpand(parent) : (parent.children ?? []);
        for (const n of fetched) nodesById.current.set(n.id, n);
        return fetched.map((n) => ({ id: n.id, data: n }));
      },
    },
    features: [asyncDataLoaderFeature, hotkeysCoreFeature],
  });

  if (initialNodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

  return (
    <div {...tree.getContainerProps("Directory tree")} className="flex flex-col py-2">
      {tree
        .getItems()
        .filter((item) => {
          const node = item.getItemData();
          if (!node) return true;
          if (filters && !nodePassesFilters(node, filters)) return false;
          return nodeFilter ? nodeFilter(node) : true;
        })
        .map((item) => {
          const node = item.getItemData();
          if (!node) return null;
          const isFolder = item.isFolder();
          const isExpanded = item.isExpanded();
          const level = item.getItemMeta().level;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars -- discard onClick so row clicks don't double-fire with the inner Link's navigation; chevron IconButton owns expand
          const { onClick: _, ...itemProps } = item.getProps();

          return (
            <div
              key={item.getKey()}
              {...itemProps}
              style={{ paddingLeft: `${level * 12}px` }}
              className="flex items-center mx-2"
            >
              {isFolder ? (
                <IconButton
                  icon="ChevronRight"
                  label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                  variant="ghost"
                  size="xs"
                  onPress={() => (isExpanded ? item.collapse() : item.expand())}
                  className={twMerge(
                    "shrink-0 transition-transform text-muted-foreground",
                    isExpanded && "rotate-90",
                    isExpanded && "text-foreground",
                  )}
                />
              ) : (
                <span className="inline-block w-7 shrink-0" aria-hidden />
              )}
              <NodeLink
                node={node}
                {...nodeLinkProps}
                className={twMerge(isExpanded && "text-foreground")}
              />
            </div>
          );
        })}
    </div>
  );
}
