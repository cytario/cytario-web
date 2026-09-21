import { Button, Dialog, Input, Select, Spinner } from "@cytario/design";
import { useCallback, useMemo, useRef, useState } from "react";

import type {
  StoragePickerOptions,
  StoragePickerResult,
  StoragePickerSelection,
} from "@cytario/plugin-api";
import { ConnectionSwitcherChip } from "~/components/ConnectionTree/ConnectionSwitcherChip";
import type { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "~/components/DirectoryView/DirectoryViewTree";
import { onExpand as defaultOnExpand } from "~/components/DirectoryView/onExpand";
import { namePassesFilters } from "~/components/DirectoryView/treeFilters";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
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
  const isFolderMode = (options.select ?? "files") === "folder";
  const [selectedNodes, setSelectedNodes] = useState<Map<string, TreeNode>>(new Map());
  const [selectedFolder, setSelectedFolder] = useState<TreeNode | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<Map<string, TreeNode>>(new Map());
  const [globFilter, setGlobFilter] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const connections = useConnectionsStore((s) => s.connections);
  const connectionIds = Object.keys(connections);

  const initialConnectionId = options.connectionId ?? connectionIds[0] ?? "";
  const [activeConnectionId, setActiveConnectionId] = useState(initialConnectionId);

  // The root row is always the connection root, so the whole connection stays
  // reachable in either mode; `initialPath` only pre-selects the folder the
  // picker opens at, once that folder is reached while expanding.
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
        pathName: "",
        children: [],
        loadState: "idle" as const,
      },
    ];
  }, [activeConnectionId, connections]);

  const initialFolderPath = asFolderPath(options.initialPath ?? "");
  const initialFolderId = initialFolderPath ? `${activeConnectionId}/${initialFolderPath}` : null;
  const presetConsumedRef = useRef(false);

  const onExpand = useCallback(
    async (parent: TreeNode) => {
      const children = await defaultOnExpand(parent);
      setLoadedFiles((prev) => {
        const next = new Map(prev);
        for (const child of children) {
          if (child.type === "file") next.set(child.id, child);
        }
        return next;
      });
      // Pre-select the initial folder the first time it is reached, so the preset
      // never overrides a destination the analyst has already picked.
      if (isFolderMode && initialFolderId && !presetConsumedRef.current) {
        const initial = children.find((child) => child.id === initialFolderId);
        if (initial) {
          presetConsumedRef.current = true;
          setSelectedFolder(initial);
        }
      }
      return children;
    },
    [isFolderMode, initialFolderId],
  );

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

  // A destination is the whole folder, so a click replaces the previous pick
  // rather than adding to it; the connection root counts as a folder. A click
  // also ends the initial-path preset — from here the analyst is in control.
  const selectFolder = useCallback((node: TreeNode) => {
    if (node.type === "file") return;
    presetConsumedRef.current = true;
    setSelectedFolder((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const glob = globFilter.trim();

  // "Add all matching" offers what's loaded minus hidden files the tree isn't showing.
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const selectableFiles = useMemo(
    () =>
      [...loadedFiles.values()].filter((n) =>
        namePassesFilters(n.name, n.type === "file", { showHiddenFiles }),
      ),
    [loadedFiles, showHiddenFiles],
  );

  const addAllMatching = useCallback(() => {
    setSelectedNodes((prev) => {
      const next = new Map(prev);
      for (const node of selectableFiles) {
        if (!glob || matchGlob(node.name, glob)) {
          next.set(node.id, node);
        }
      }
      return next;
    });
  }, [glob, selectableFiles]);

  const handleConfirm = useCallback(() => {
    if (isFolderMode) {
      if (!selectedFolder) return;
      onConfirm([
        [
          {
            connectionId: selectedFolder.connectionId,
            path: asFolderPath(selectedFolder.pathName),
          },
        ],
      ]);
      return;
    }
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
  }, [isFolderMode, selectedFolder, selectedNodes, options.groupBy, groupBy, onConfirm]);

  // Folder mode has no meaningful file-selection affordances.
  const showGlob = !isFolderMode && (options.globFilter ?? false);
  const showGroupBy = !isFolderMode && (options.groupBy ?? false);
  const matchingCount = useMemo(() => {
    if (!glob) return selectableFiles.length;
    let count = 0;
    for (const node of selectableFiles) {
      if (matchGlob(node.name, glob)) count++;
    }
    return count;
  }, [glob, selectableFiles]);

  const selectionSummary = useMemo(() => {
    if (isFolderMode) {
      if (!selectedFolder) return "No folder selected";
      return `Destination: ${asFolderPath(selectedFolder.pathName) || "connection root"}`;
    }
    if (selectedNodes.size === 0) return "No files selected";
    if (showGroupBy && groupBy) {
      const groups = new Set(
        Array.from(selectedNodes.values()).map((n) => computeGroupKey(n.pathName, groupBy)),
      );
      return `${groups.size} groups from ${selectedNodes.size} files`;
    }
    return `${selectedNodes.size} file${selectedNodes.size === 1 ? "" : "s"} selected`;
  }, [isFolderMode, selectedFolder, selectedNodes, showGroupBy, groupBy]);

  const confirmDisabled = isFolderMode ? !selectedFolder : selectedNodes.size === 0;

  return (
    <Dialog
      isOpen
      onOpenChange={onCancel}
      title={isFolderMode ? "Choose a destination" : "Add inputs"}
      size="xl"
    >
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
                setSelectedFolder(null);
                setLoadedFiles(new Map());
                presetConsumedRef.current = false;
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

          <div className="max-h-80 overflow-y-auto rounded-sm border border-border">
            <DirectoryViewTree
              key={activeConnectionId}
              nodes={rootNodes}
              kind="entries"
              onExpand={onExpand}
              defaultExpandedItems={rootNodes.map((n) => n.id)}
              filters={{ showHiddenFiles }}
              nodeFilter={
                glob ? (node) => node.type !== "file" || matchGlob(node.name, glob) : undefined
              }
              nodeLinkProps={
                isFolderMode
                  ? {
                      isClickable: (node) => node.type !== "file",
                      onClick: (node) => {
                        if (node.type !== "file") selectFolder(node);
                      },
                    }
                  : {
                      isClickable: () => false,
                      onClick: (node) => {
                        if (node.type === "file") {
                          if (glob && !matchGlob(node.name, glob)) return;
                          toggleNode(node);
                        }
                      },
                      isSelected,
                      onToggleSelect: toggleNode,
                    }
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{selectionSummary}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onPress={onCancel}>
                Cancel
              </Button>
              <Button isDisabled={confirmDisabled} onPress={handleConfirm}>
                {isFolderMode ? "Save here" : "Add"}
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

/** Folder paths carry a trailing slash and read as `""` at the connection root. */
function asFolderPath(pathName: string): string {
  const trimmed = pathName.replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
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
