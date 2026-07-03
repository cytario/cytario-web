import { Badge } from "@cytario/design";
import { useMemo, useState } from "react";

import { AnnotationsList } from "./AnnotationsList";
import { AnnotationsTools } from "./AnnotationsTools";
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
 *  work), a region count and an opacity popover trailing it, and the user's
 *  class groups beneath. Clicking the name collapses the group list. */
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
  const opacity = useViewerStore((s) => s.annotationView[userId]?.opacity ?? 1);
  const setOpacity = useViewerStore((s) => s.setAnnotationOpacity);
  const [isOpen, setIsOpen] = useState(true);

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
        {features.length > 0 && <Badge>{features.length}</Badge>}
        <FeatureItemSlider
          aria-label={`${label} annotation opacity`}
          value={opacity}
          onChange={(value) => setOpacity(userId, value)}
        />
      </div>

      {isOpen && <AnnotationsList userId={userId} features={features} editable={editable} />}
    </div>
  );
};

export const AnnotationsPanel = () => {
  const annotationsByUser = useViewerStore((s) => s.annotationsByUser);
  const ownUserId = useCurrentUser()?.sub;

  // One block per user, own first. Own always appears — even with no
  // annotations yet — so its class list and draw tools are reachable.
  const entries = useMemo(() => {
    const list = Object.entries(annotationsByUser);
    if (ownUserId && !annotationsByUser[ownUserId]) list.push([ownUserId, []]);
    return list.sort(([a], [b]) => (a === ownUserId ? -1 : b === ownUserId ? 1 : 0));
  }, [annotationsByUser, ownUserId]);

  const total = entries.reduce((sum, [, features]) => sum + features.length, 0);

  return (
    <FeatureItem
      title="Annotations"
      badge={total ? String(total) : undefined}
      header={<AnnotationsTools />}
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
