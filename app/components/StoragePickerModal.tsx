import { Button, Dialog, Input, Select, Spinner } from "@cytario/design";
import { useCallback, useMemo, useState } from "react";

import type {
  StoragePickerOptions,
  StoragePickerResult,
  StoragePickerSelection,
} from "@cytario/plugin-api";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand as defaultOnExpand } from "~/components/DirectoryView/onExpand";
import { ConnectionSwitcherChip } from "~/components/Sidebar/ConnectionSwitcherChip";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

interface StoragePickerModalProps {
  options: StoragePickerOptions;
  onConfirm: (results: StoragePickerSelection) => void;
  onCancel: () => void;
}

const GROUP_BY_OPTIONS = [
  { id: "", name: "None — one group per file" },
  { id: "_", name: 'Filename prefix (before last "_")' },
  { id: "/", name: "First path segment" },
];

export function StoragePickerModal({ options, onConfirm, onCancel }: StoragePickerModalProps) {
  const [selectedNodes, setSelectedNodes] = useState<Map<string, TreeNode>>(new Map());
  const [loadedFiles, setLoadedFiles] = useState<Map<string, TreeNode>>(new Map());
  const [globFilter, setGlobFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const connections = useConnectionsStore((s) => s.connections);
  const connectionIds = Object.keys(connections);

  const initialConnectionId = options.connectionId ?? connectionIds[0] ?? "";
  const [activeConnectionId, setActiveConnectionId] = useState(initialConnectionId);

  const rootNodes = useMemo(() => {
    if (!activeConnectionId) return [];
    const conn = connections[activeConnectionId];
    if (!conn) return [];
    return [
      {
        id: `${activeConnectionId}/`,
        connectionId: activeConnectionId,
        connectionName: conn.connectionConfig.name,
        name: conn.connectionConfig.name,
        type: "bucket" as const,
        pathName: options.initialPath ?? "",
        children: [],
        loadState: "idle" as const,
      },
    ];
  }, [activeConnectionId, connections, options.initialPath]);

  const onExpand = useCallback(async (parent: TreeNode) => {
    const children = await defaultOnExpand(parent);
    setLoadedFiles((prev) => {
      const next = new Map(prev);
      for (const child of children) {
        if (child.type === "file") next.set(child.id, child);
      }
      return next;
    });
    return children;
  }, []);

  const toggleNode = useCallback((node: TreeNode) => {
    if (node.type !== "file") return;
    setLoadedFiles((prev) => {
      if (prev.has(node.id)) return prev;
      const next = new Map(prev);
      next.set(node.id, node);
      return next;
    });
    setSelectedNodes((prev) => {
      const next = new Map(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.set(node.id, node);
      return next;
    });
  }, []);

  const isSelected = useCallback((node: TreeNode) => selectedNodes.has(node.id), [selectedNodes]);

  const glob = globFilter.trim();

  const addAllMatching = useCallback(() => {
    setSelectedNodes((prev) => {
      const next = new Map(prev);
      for (const [id, node] of loadedFiles) {
        if (!glob || matchGlob(node.name, glob)) {
          next.set(id, node);
        }
      }
      return next;
    });
  }, [glob]);

  const handleConfirm = useCallback(() => {
    const results: StoragePickerResult[] = [];
    for (const node of selectedNodes.values()) {
      if (node.type === "file") {
        results.push({ connectionId: node.connectionId, path: node.pathName });
      }
    }
    if (options.groupBy && groupBy) {
      onConfirm(groupResults(results, groupBy));
    } else {
      onConfirm(results.map((r) => [r]));
    }
  }, [selectedNodes, options.groupBy, groupBy, onConfirm]);

  const showGlob = options.globFilter ?? false;
  const showGroupBy = options.groupBy ?? false;
  const matchingCount = useMemo(() => {
    if (!glob) return loadedFiles.size;
    let count = 0;
    for (const node of loadedFiles.values()) {
      if (matchGlob(node.name, glob)) count++;
    }
    return count;
  }, [glob, loadedFiles]);

  const selectionSummary = useMemo(() => {
    if (selectedNodes.size === 0) return "No files selected";
    if (showGroupBy && groupBy) {
      const groups = new Set(
        Array.from(selectedNodes.values()).map((n) => computeGroupKey(n.pathName, groupBy)),
      );
      return `${groups.size} groups from ${selectedNodes.size} files`;
    }
    return `${selectedNodes.size} file${selectedNodes.size === 1 ? "" : "s"} selected`;
  }, [selectedNodes, showGroupBy, groupBy]);

  return (
    <Dialog isOpen onOpenChange={onCancel} title="Add inputs" size="xl">
      {connectionIds.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <ConnectionSwitcherChip
              selectedConnection={activeConnectionId}
              onSelect={(id) => {
                setActiveConnectionId(id);
                setSelectedNodes(new Map());
                setLoadedFiles(new Map());
              }}
            />
            {showGlob && (
              <>
                <Input
                  value={globFilter}
                  onChange={setGlobFilter}
                  placeholder="Filter (optional)"
                />
                <Button
                  variant="secondary"
                  isDisabled={matchingCount === 0}
                  onPress={addAllMatching}
                >
                  Add all{glob ? ` (${matchingCount})` : ""}
                </Button>
              </>
            )}
            {showGroupBy && (
              <Select
                items={GROUP_BY_OPTIONS}
                value={groupBy || undefined}
                onChange={(key) => setGroupBy(key == null ? "" : String(key))}
                aria-label="Group by"
                placeholder="Group by"
              />
            )}
          </div>

          <div className="max-h-80 overflow-y-auto rounded border border-border">
            <DirectoryViewTree
              key={activeConnectionId}
              nodes={rootNodes}
              kind="entries"
              onExpand={onExpand}
              defaultExpandedItems={rootNodes.map((n) => n.id)}
              nodeFilter={
                glob ? (node) => node.type !== "file" || matchGlob(node.name, glob) : undefined
              }
              nodeLinkProps={{
                isClickable: () => false,
                onClick: (node) => {
                  if (node.type === "file") {
                    if (glob && !matchGlob(node.name, glob)) return;
                    toggleNode(node);
                  }
                },
                contextMenu: false,
                isSelected,
                onToggleSelect: toggleNode,
              }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{selectionSummary}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={onCancel}>
                Cancel
              </Button>
              <Button isDisabled={selectedNodes.size === 0} onPress={handleConfirm}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function groupResults(results: StoragePickerResult[], groupBy: string): StoragePickerSelection {
  const groups = new Map<string, StoragePickerResult[]>();
  for (const r of results) {
    const key = computeGroupKey(r.path, groupBy);
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  return Array.from(groups.values());
}

function computeGroupKey(path: string, groupBy: string): string {
  if (groupBy === "/") return path.split("/")[0] ?? path;
  if (groupBy === "_") {
    const name = path.split("/").pop() ?? path;
    const idx = name.lastIndexOf("_");
    return idx > 0 ? name.slice(0, idx) : name;
  }
  return path;
}

function matchGlob(name: string, pattern: string): boolean {
  return globToRegex(pattern).test(name);
}

function globToRegex(pattern: string): RegExp {
  let re = "^";
  for (const ch of pattern) {
    if (ch === "*") re += "[^/]*";
    else if (ch === "?") re += "[^/]";
    else if (ch === "[") re += "[";
    else if (ch === "]") re += "]";
    else if ("\\^$.|+(){}".includes(ch)) re += `\\${ch}`;
    else re += ch;
  }
  re += "$";
  return new RegExp(re);
}
