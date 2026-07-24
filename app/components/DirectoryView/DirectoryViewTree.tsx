import { IconButton } from "@cytario/design";
import { asyncDataLoaderFeature, hotkeysCoreFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";

interface DirectoryViewTreeProps {
  nodes: TreeNode[];
  kind: DirectoryKind;
  nodeLinkProps?: Omit<React.ComponentProps<typeof NodeLink>, "node">;
  /** Called when a lazy stub (`loadState === "idle"`) is expanded. Omit for static trees. */
  onExpand?: (parent: TreeNode) => Promise<TreeNode[]>;
  /** Items expanded when the tree first mounts. */
  defaultExpandedItems?: string[];
  /**
   * Ancestor ids to reveal reactively. Whenever this changes, the ids are
   * unioned into the expanded set (never removing manual expansions), and the
   * async loader cascade-loads each newly-expanded level. Use to follow the
   * active route on client-side navigation. Omit for static trees.
   */
  revealItems?: string[];
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
}: DirectoryViewTreeProps) {
  const nodesById = useRef<Map<string, TreeNode>>(new Map());
  const [expandedItems, setExpandedItems] = useState<string[]>(defaultExpandedItems ?? []);

  // Reveal a deep-linked path on navigation: when `revealItems` changes, union
  // the requested ancestor ids into the expanded set without disturbing manual
  // expansions. The async loader then cascade-loads each newly-expanded level.
  // Adjust-state-during-render (not an effect) so the reveal lands in the same
  // commit as the route change.
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
        // `loadState === "idle"` marks a lazy stub awaiting fetch. Everything
        // else (loaded, undefined, search-result trees) uses the embedded
        // `parent.children` directly.
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
      {tree.getItems().map((item) => {
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
            style={{ paddingLeft: `${level * 28}px` }}
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
