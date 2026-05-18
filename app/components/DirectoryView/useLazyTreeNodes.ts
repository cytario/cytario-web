import { useCallback, useEffect, useRef, useState } from "react";

import { TreeNode } from "./buildDirectoryTree";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { formatTruncationMessage } from "~/utils/listingLimits";
import { loadConnectionLevel } from "~/utils/loadConnectionLevel";

/**
 * Lazily-expanding tree backed by direct browser → S3 listings.
 * `loadChildren` is idempotent and dedupes concurrent calls; each
 * `initialNodes` cohort owns an `AbortController` so stale responses
 * cannot overwrite a fresh tree after navigation.
 */
export function useLazyTreeNodes(initialNodes: TreeNode[]) {
  const [nodes, setNodes] = useState<TreeNode[]>(initialNodes);
  const inflightRef = useRef<Map<string, Promise<TreeNode[]>>>(new Map());
  const abortRef = useRef<AbortController>(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    inflightRef.current = new Map();
    setNodes(initialNodes);
    return () => {
      controller.abort();
    };
  }, [initialNodes]);

  const loadChildren = useCallback(async (node: TreeNode): Promise<TreeNode[]> => {
    if (
      !node.connectionName ||
      node.isLeaf ||
      node.hasChildren === false ||
      node.loadState === "loaded"
    ) {
      return node.children ?? [];
    }
    const connectionName = node.connectionName;
    const key = `${connectionName} ${node.pathName}`;
    const existing = inflightRef.current.get(key);
    if (existing) return existing;

    const connection = select.connection(connectionName)(useConnectionsStore.getState());
    if (!connection) {
      throw new Error(`No connection in store for "${connectionName}"`);
    }
    const { connectionConfig, credentials } = connection;

    const controller = abortRef.current;
    const { signal } = controller;
    const inflightMap = inflightRef.current;

    setNodes((prev) =>
      replaceNodeById(prev, node.id, (n) => ({
        ...n,
        loadState: "loading",
      })),
    );

    const promise = (async () => {
      try {
        const { nodes: children, isCapped } = await loadConnectionLevel({
          connectionConfig,
          credentials,
          connectionName,
          urlPath: node.pathName,
          signal,
        });
        if (signal.aborted) return [];

        if (isCapped) {
          toastBridge.emit({
            variant: toToastVariant("warning"),
            message: formatTruncationMessage(node.name),
          });
        }
        setNodes((prev) =>
          replaceNodeById(prev, node.id, (n) => ({
            ...n,
            children,
            loadState: "loaded",
          })),
        );
        return children;
      } catch (error) {
        if (signal.aborted) return [];
        setNodes((prev) =>
          replaceNodeById(prev, node.id, (n) => ({
            ...n,
            loadState: "error",
          })),
        );
        throw error;
      } finally {
        if (inflightMap === inflightRef.current) {
          inflightMap.delete(key);
        }
      }
    })();

    inflightRef.current.set(key, promise);
    return promise;
  }, []);

  return { nodes, loadChildren };
}

function replaceNodeById(
  nodes: TreeNode[],
  id: string,
  update: (n: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n) => {
    if (n.id === id) return update(n);
    if (!n.children || n.children.length === 0) return n;
    return { ...n, children: replaceNodeById(n.children, id, update) };
  });
}
