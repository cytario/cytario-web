import { IconButton } from "@cytario/design";
import { asyncDataLoaderFeature, hotkeysCoreFeature, selectionFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ChevronRight } from "lucide-react";
import { useRef } from "react";
import { twMerge } from "tailwind-merge";

import { type TreeNode } from "./buildDirectoryTree";
import type { DirectoryKind } from "./DirectoryView";
import { DirectoryViewEmptyState } from "./DirectoryViewEmptyState";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { formatTruncationMessage } from "~/utils/listingLimits";
import { loadConnectionLevel } from "~/utils/loadConnectionLevel";

interface DirectoryViewTreeProps {
  nodes: TreeNode[];
  searchTerm?: string;
  kind: DirectoryKind;
}

const ROOT_ID = "__directory_tree_root__";

export function DirectoryViewTree({ nodes: initialNodes, kind }: DirectoryViewTreeProps) {
  const nodesById = useRef<Map<string, TreeNode>>(new Map());

  const tree = useTree<TreeNode>({
    rootItemId: ROOT_ID,
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
        if (!parent || parent.isLeaf || parent.type === "file") return [];
        const conn = select.connection(parent.connectionName)(useConnectionsStore.getState());
        if (!conn) return [];
        const { nodes, isCapped } = await loadConnectionLevel({
          connectionConfig: conn.connectionConfig,
          credentials: conn.credentials,
          connectionName: parent.connectionName,
          urlPath: parent.pathName,
        });
        if (isCapped) {
          toastBridge.emit({
            variant: toToastVariant("warning"),
            message: formatTruncationMessage(parent.name),
          });
        }
        for (const n of nodes) nodesById.current.set(n.id, n);
        return nodes.map((n) => ({ id: n.id, data: n }));
      },
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  if (initialNodes.length === 0) return <DirectoryViewEmptyState kind={kind} />;

  return (
    <div {...tree.getContainerProps("Directory tree")} className="flex flex-col">
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
            style={{ paddingLeft: `${level * 16}px` }}
            className="flex items-center min-h-8"
          >
            {isFolder ? (
              <IconButton
                icon={ChevronRight}
                aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
                variant="ghost"
                size="sm"
                onPress={() => (isExpanded ? item.collapse() : item.expand())}
                className={twMerge("shrink-0 transition-transform", isExpanded && "rotate-90")}
              />
            ) : (
              <span className="inline-block w-6 shrink-0" aria-hidden />
            )}
            <NodeLink node={node} />
          </div>
        );
      })}
    </div>
  );
}
