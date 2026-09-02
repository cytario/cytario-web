import {
  Badge,
  Button,
  Dialog,
  IconButton,
  Menu,
  MenuItem,
  Switch,
  useToast,
} from "@cytario/design";
import { useEffect, useMemo, useRef, useState } from "react";

import { AnnotationsList } from "./AnnotationsList";
import { select } from "../../../state/store/selectors";
import {
  classNameOf,
  selectSetHiddenClasses,
} from "../../../state/store/slices/viewer.annotations.store";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { useCanAnnotate } from "../../../utils/useCanAnnotate";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";
import { SearchInput } from "~/components/SearchInput";
import { parseAnnotationImportFile } from "~/utils/db/annotationImport";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";
import { parseResourceId } from "~/utils/resourceId";
import { getSidecarKey } from "~/utils/sidecarKey";

/** One annotation set's block inside the Annotations section: the sidecar as a
 *  NodeLink (label = set name, node = the real sidecar object so Open / Copy
 *  S3 URI work; when the grant permits annotating its context menu also offers
 *  Rename and Delete annotation set, and double-clicking the name opens an
 *  inline edit) with a region count, and the set's class groups beneath.
 *  Clicking the name collapses the group list. Opacity is section-level. */
const AnnotationFileBlock = ({
  setId,
  label,
  features,
  searchQuery,
  editable,
}: {
  setId: string;
  label: string;
  features: AnnotationFeature[];
  searchQuery: string;
  /** Connection grant permits annotating — edit affordances stay available. */
  editable: boolean;
}) => {
  const imageResourceId = useViewerStore((s) => s.id);
  const hiddenClasses = useViewerStore(selectSetHiddenClasses(setId));
  const setSetHidden = useViewerStore((s) => s.setAnnotationSetHidden);
  const deleteAnnotationSet = useViewerStore((s) => s.deleteAnnotationSet);
  const renameAnnotationSet = useViewerStore((s) => s.renameAnnotationSet);
  const [isOpen, setIsOpen] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(label);

  // The file is "visible" while at least one of its regions' classes isn't hidden.
  const anyVisible = features.some((f) => !hiddenClasses.includes(classNameOf(f)));

  // The set's sidecar as a TreeNode — a real, co-located S3 object.
  const node = useMemo<TreeNode>(() => {
    const { connectionId, pathName } = parseResourceId(imageResourceId);
    const sidecarPath = getSidecarKey(pathName, "annotations", setId);
    return {
      id: `${connectionId}/${sidecarPath}`,
      connectionId,
      connectionName: "",
      pathName: sidecarPath,
      name: label,
      type: "file",
      isLeaf: true,
      // Sentinel Size passes NodeContextMenu's known-size download gate —
      // sidecars are app-written small JSON, so the 256 MB OOM guard doesn't
      // apply (C-330's original sidecar-download scope, via C-445's path).
      // Never displayed; the real size lives on S3.
      _Object: { Key: sidecarPath, Size: 0 },
    };
  }, [imageResourceId, setId, label]);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const startRename = () => {
    setDraftName(label);
    setIsRenaming(true);
  };
  useEffect(() => {
    if (isRenaming) renameInputRef.current?.focus();
  }, [isRenaming]);
  const commitRename = () => {
    setIsRenaming(false);
    if (draftName.trim() !== label) renameAnnotationSet(setId, draftName);
  };

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setIsRenaming(false);
            }}
            aria-label={`Rename ${label}`}
            className="h-7 min-w-0 grow rounded-md border border-input bg-background px-2 font-medium text-sm outline-none focus-visible:outline focus-visible:outline-ring"
          />
        ) : (
          <div
            className="min-w-0 grow"
            onDoubleClick={() => {
              if (editable) startRename();
            }}
          >
            <NodeLink
              node={node}
              onClick={() => setIsOpen(!isOpen)}
              contextMenuItems={
                editable && (
                  <>
                    <MenuItem id="rename-set" icon="Pencil" onAction={startRename}>
                      Rename annotation set
                    </MenuItem>
                    <MenuItem
                      id="delete-set"
                      icon="Trash2"
                      isDanger
                      onAction={() => setConfirmDelete(true)}
                    >
                      Delete annotation set
                    </MenuItem>
                  </>
                )
              }
            />
          </div>
        )}
        <Badge>{features.length}</Badge>
        <Switch
          isSelected={anyVisible}
          isDisabled={features.length === 0}
          onChange={(visible) => setSetHidden(setId, !visible)}
          aria-label={`Toggle ${label} annotations visibility`}
        />
      </div>

      <Dialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${label}?`}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This removes the {features.length} region{features.length === 1 ? "" : "s"} and deletes
            the annotation sidecar file from S3 for everyone on this bucket. It can be undone until
            the page is left.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onPress={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onPress={() => {
                deleteAnnotationSet(setId);
                setConfirmDelete(false);
              }}
            >
              Delete
            </Button>
          </div>
        </div>
      </Dialog>

      {isOpen && (
        <AnnotationsList
          setId={setId}
          features={features}
          editable={editable}
          searchQuery={searchQuery}
        />
      )}
    </div>
  );
};

/** Sidebar annotations control: list, group, toggle visibility, delete. */
export const AnnotationsControl = () => {
  const { toast } = useToast();
  const annotationSets = useViewerStore((s) => s.annotationSets);
  const annotationView = useViewerStore((s) => s.annotationView);
  const annotationsOpacity = useViewerStore(select.annotationsOpacity);
  const setAnnotationsOpacity = useViewerStore(select.setAnnotationsOpacity);
  const showOutline = useViewerStore(select.showAnnotationOutline);
  const setShowOutline = useViewerStore(select.setShowAnnotationOutline);
  const [searchQuery, setSearchQuery] = useState("");
  const seedAnnotations = useViewerStore((s) => s.seedAnnotations);
  const createAnnotationSet = useViewerStore((s) => s.createAnnotationSet);
  const canAnnotate = useCanAnnotate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (file: File) => {
    try {
      const features = await parseAnnotationImportFile(file);
      seedAnnotations([
        {
          id: crypto.randomUUID(),
          createdBy: undefined,
          name: file.name,
          features,
        },
      ]);
    } catch (e) {
      toast({
        variant: "error",
        message: e instanceof Error ? e.message : `Failed to import "${file.name}"`,
      });
    }
  };

  // visible/total regions across all sets.
  const total = annotationSets.reduce((sum, s) => sum + s.features.length, 0);
  const visible = annotationSets.reduce((sum, s) => {
    const hidden = annotationView[s.id]?.hiddenClasses ?? [];
    return sum + s.features.filter((f) => !hidden.includes(classNameOf(f))).length;
  }, 0);

  return (
    <FeatureItem
      title="Annotations"
      badge={`${visible}/${total}`}
      header={
        <SearchInput
          onQueryChange={setSearchQuery}
          aria-label="Search annotations by name"
          placeholder="Search annotations…"
          className="flex items-center gap-1 px-2 py-1"
        />
      }
      actions={
        <>
          {canAnnotate && (
            <Menu
              content={
                <>
                  <MenuItem id="new-set" icon="Plus" onAction={() => createAnnotationSet()}>
                    New annotation set
                  </MenuItem>
                  <MenuItem
                    id="import-set"
                    icon="File"
                    onAction={() => fileInputRef.current?.click()}
                  >
                    Import from file…
                  </MenuItem>
                </>
              }
            >
              <IconButton icon="Plus" label="Add annotation set" variant="ghost" size="xs" />
            </Menu>
          )}
          {canAnnotate && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.geojson,application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = "";
              }}
            />
          )}
          <IconButton
            icon={showOutline ? "CircleDot" : "Circle"}
            label={showOutline ? "Hide outlines" : "Show outlines"}
            onPress={() => setShowOutline(!showOutline)}
            variant="ghost"
            size="xs"
          />
          <FeatureItemSlider
            aria-label="Annotation opacity"
            value={annotationsOpacity}
            onChange={setAnnotationsOpacity}
          />
        </>
      }
    >
      <div className="flex flex-col">
        {annotationSets.map((s, i) => (
          <AnnotationFileBlock
            key={s.id}
            setId={s.id}
            // Legacy sets created before names existed fall back positionally
            // (with .json, matching minted/imported names).
            label={s.name ?? `Annotation Set ${i + 1}.json`}
            features={s.features}
            searchQuery={searchQuery}
            editable={canAnnotate}
          />
        ))}
      </div>
    </FeatureItem>
  );
};
