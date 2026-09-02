import { Badge, IconButton, Switch } from "@cytario/design";
import { useMemo, useRef, useState } from "react";

import { AnnotationsList } from "./AnnotationsList";
import { select } from "../../../state/store/selectors";
import {
  classNameOf,
  selectSetHiddenClasses,
} from "../../../state/store/slices/viewer.annotations.store";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";
import { SearchInput } from "~/components/SearchInput";
import { validAnnotationFeatures } from "~/utils/db/annotationSchema";
import type { AnnotationFeature, AnnotationSet } from "~/utils/db/getAnnotationsWasm";
import { parseResourceId } from "~/utils/resourceId";
import { getSidecarKey } from "~/utils/sidecarKey";

/** One user's annotation sidecar inside the Annotations section: the file as a
 *  NodeLink (label = user, node = the real sidecar object so Open / Copy S3 URI
 *  work) with a region count, and the user's class groups beneath. Clicking the
 *  name collapses the group list. Opacity is section-level (whole layer). */
const AnnotationFileBlock = ({
  setId,
  label,
  features,
  searchQuery,
}: {
  setId: string;
  label: string;
  features: AnnotationFeature[];
  searchQuery: string;
}) => {
  const imageResourceId = useViewerStore((s) => s.id);
  const hiddenClasses = useViewerStore(selectSetHiddenClasses(setId));
  const setSetHidden = useViewerStore((s) => s.setAnnotationSetHidden);
  const [isOpen, setIsOpen] = useState(true);

  // The file is "visible" while at least one of its regions' classes isn't hidden.
  const anyVisible = features.some((f) => !hiddenClasses.includes(classNameOf(f)));

  // The user's sidecar as a TreeNode — a real, co-located S3 object.
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
    };
  }, [imageResourceId, setId, label]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <NodeLink node={node} onClick={() => setIsOpen(!isOpen)} />
        <Badge>{features.length}</Badge>
        <Switch
          isSelected={anyVisible}
          isDisabled={features.length === 0}
          onChange={(visible) => setSetHidden(setId, !visible)}
          aria-label={`Toggle ${label} annotations visibility`}
        />
      </div>

      {isOpen && <AnnotationsList setId={setId} features={features} searchQuery={searchQuery} />}
    </div>
  );
};

/** Sidebar annotations control: list, group, toggle visibility, delete. */
export const AnnotationsControl = () => {
  const annotationSets = useViewerStore((s) => s.annotationSets);
  const annotationView = useViewerStore((s) => s.annotationView);
  const annotationsOpacity = useViewerStore(select.annotationsOpacity);
  const setAnnotationsOpacity = useViewerStore(select.setAnnotationsOpacity);
  const showOutline = useViewerStore(select.showAnnotationOutline);
  const setShowOutline = useViewerStore(select.setShowAnnotationOutline);
  const [searchQuery, setSearchQuery] = useState("");
  const seedAnnotations = useViewerStore((s) => s.seedAnnotations);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as { features?: unknown };
      const features = validAnnotationFeatures(json.features);
      const id = crypto.randomUUID();
      const set: AnnotationSet = { id, createdBy: undefined, features };
      seedAnnotations([set]);
    } catch (e) {
      console.error("[annotations] import failed:", e);
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
          <IconButton
            icon="Plus"
            label="Import annotations from GeoJSON"
            onPress={() => fileInputRef.current?.click()}
            variant="ghost"
            size="xs"
          />
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
            label={`Annotation Set ${i + 1}`}
            features={s.features}
            searchQuery={searchQuery}
          />
        ))}
      </div>
    </FeatureItem>
  );
};
