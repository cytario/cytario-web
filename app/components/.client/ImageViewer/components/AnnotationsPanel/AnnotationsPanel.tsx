import { Badge, Switch } from "@cytario/design";
import { useMemo, useState } from "react";

import { AnnotationsList } from "./AnnotationsList";
import { AnnotationsTools } from "./AnnotationsTools";
import {
  classNameOf,
  selectUserHiddenClasses,
} from "../../state/store/slices/viewer.annotations.store";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { NodeLink } from "~/components/DirectoryView/NodeLink/NodeLink";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { FeatureItemSlider } from "~/components/FeatureItem/FeatureItemSlider";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import type { AnnotationFeature } from "~/utils/db/getAnnotationsWasm";
import { parseResourceId } from "~/utils/resourceId";
import { getSidecarKey } from "~/utils/sidecarKey";

/** One user's annotation sidecar inside the Annotations section: the file as a
 *  NodeLink (label = user, node = the real sidecar object so Open / Copy S3 URI
 *  work) with a region count, and the user's class groups beneath. Clicking the
 *  name collapses the group list. Opacity is section-level (whole layer). */
const AnnotationFileBlock = ({
  userId,
  label,
  features,
  editable,
}: {
  userId: string;
  label: string;
  features: AnnotationFeature[];
  editable: boolean;
}) => {
  const imageResourceId = useViewerStore((s) => s.id);
  const hiddenClasses = useViewerStore(selectUserHiddenClasses(userId));
  const setUserHidden = useViewerStore((s) => s.setAnnotationUserHidden);
  const [isOpen, setIsOpen] = useState(true);

  // The file is "visible" while at least one of its regions' classes isn't hidden.
  const anyVisible = features.some((f) => !hiddenClasses.includes(classNameOf(f)));

  // The user's sidecar as a TreeNode — a real, co-located S3 object.
  const node = useMemo<TreeNode>(() => {
    const { connectionName, pathName } = parseResourceId(imageResourceId);
    const sidecarPath = getSidecarKey(pathName, "annotations", userId);
    return {
      id: `${connectionName}/${sidecarPath}`,
      connectionName,
      pathName: sidecarPath,
      name: label,
      type: "file",
      isLeaf: true,
    };
  }, [imageResourceId, userId, label]);

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center gap-2">
        <NodeLink node={node} onClick={() => setIsOpen(!isOpen)} />
        <Badge>{features.length}</Badge>
        {features.length > 0 && (
          <Switch
            isSelected={anyVisible}
            onChange={(visible) => setUserHidden(userId, !visible)}
            aria-label={`Toggle ${label} annotations visibility`}
          />
        )}
      </div>

      {isOpen && <AnnotationsList userId={userId} features={features} editable={editable} />}
    </div>
  );
};

export const AnnotationsPanel = () => {
  const annotationsByUser = useViewerStore((s) => s.annotationsByUser);
  const annotationView = useViewerStore((s) => s.annotationView);
  const annotationsOpacity = useViewerStore((s) => s.annotationsOpacity);
  const setAnnotationsOpacity = useViewerStore((s) => s.setAnnotationsOpacity);
  const ownUserId = useCurrentUser()?.sub;

  // One block per user, own first. Own always appears — even with no
  // annotations yet — so its class list and draw tools are reachable.
  const entries = useMemo(() => {
    const list = Object.entries(annotationsByUser);
    if (ownUserId && !annotationsByUser[ownUserId]) list.push([ownUserId, []]);
    return list.sort(([a], [b]) => (a === ownUserId ? -1 : b === ownUserId ? 1 : 0));
  }, [annotationsByUser, ownUserId]);

  // visible/total regions across all users — the same badge semantic as the
  // Channels panel; a region is visible while its class isn't toggled off.
  const total = entries.reduce((sum, [, features]) => sum + features.length, 0);
  const visible = entries.reduce((sum, [userId, features]) => {
    const hidden = annotationView[userId]?.hiddenClasses ?? [];
    return sum + features.filter((f) => !hidden.includes(classNameOf(f))).length;
  }, 0);

  return (
    <FeatureItem
      title="Annotations"
      badge={`${visible}/${total}`}
      header={<AnnotationsTools />}
      actions={
        <FeatureItemSlider
          aria-label="Annotation opacity"
          value={annotationsOpacity}
          onChange={setAnnotationsOpacity}
        />
      }
    >
      <div className="flex flex-col">
        {entries.map(([userId, features]) => (
          <AnnotationFileBlock
            key={userId}
            userId={userId}
            label={userId === ownUserId ? "You" : userId.slice(0, 6)}
            features={features}
            editable={userId === ownUserId}
          />
        ))}
      </div>
    </FeatureItem>
  );
};
