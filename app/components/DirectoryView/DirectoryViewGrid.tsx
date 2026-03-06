import { FileCard } from "@cytario/design";
import { filesize } from "filesize";
import { lazy, Suspense, useCallback } from "react";
import { useLocation, useNavigate } from "react-router";

import { TreeNode } from "./buildDirectoryTree";
import { type ViewMode } from "./useLayoutStore";
import { ClientOnly } from "~/components/ClientOnly";
import { isOmeTiff } from "~/utils/omeTiffOffsets";
import { createResourceId, nodeToPath } from "~/utils/resourceId";

const ViewerStoreProvider = lazy(() =>
  import("~/components/.client/ImageViewer/state/ViewerStoreContext").then(
    (mod) => ({ default: mod.ViewerStoreProvider }),
  ),
);
const ImagePreview = lazy(() =>
  import(
    "~/components/.client/ImageViewer/components/Image/ImagePreview"
  ).then((mod) => ({ default: mod.ImagePreview })),
);

const gridClasses: Record<string, string> = {
  "grid-sm":
    "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3",
  "grid-md": "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6",
  "grid-lg": "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6",
};

/** Extract the file extension from a filename (e.g. "sample.ome.tif" -> "ome.tif"). */
function getExtension(name: string): string | undefined {
  const omeTiffMatch = name.match(/\.(ome\.tiff?)$/i);
  if (omeTiffMatch) return omeTiffMatch[1];

  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) return undefined;
  return name.slice(dotIndex + 1);
}

function FileCardGridItem({
  node,
  compact,
}: {
  node: TreeNode;
  compact: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const resourceId = createResourceId(
    node.provider,
    node.bucketName,
    node.pathName,
  );
  const to = nodeToPath(node);
  const nodeId = node.pathName ?? node.name;

  const handlePress = useCallback(() => {
    navigate(to);
  }, [navigate, to]);

  const handleInfo = useCallback(() => {
    const search = new URLSearchParams(location.search);
    search.set(node.type, nodeId);
    navigate({
      pathname: location.pathname,
      search: `?${search.toString()}`,
    });
  }, [nodeId, location.pathname, location.search, navigate, node.type]);

  const cardType = node.type === "file" ? "file" : "directory";
  const extension =
    node.type === "file" ? getExtension(node.name) : undefined;
  const size =
    node.type === "file" && node._Object?.Size
      ? filesize(node._Object.Size)
      : undefined;

  const key = node._Object?.Key;
  const url = node._Object?.presignedUrl;
  const hasOmeTiffPreview = !!url && !!key && isOmeTiff(key);

  return (
    <FileCard
      name={node.name}
      type={cardType}
      extension={extension}
      size={typeof size === "string" ? size : undefined}
      compact={compact}
      onPress={handlePress}
      onInfo={handleInfo}
    >
      {hasOmeTiffPreview && (
        <ClientOnly>
          <Suspense
            fallback={
              <div className="animate-pulse w-full h-full bg-slate-600" />
            }
          >
            <ViewerStoreProvider resourceId={resourceId} url={url}>
              <ImagePreview />
            </ViewerStoreProvider>
          </Suspense>
        </ClientOnly>
      )}
    </FileCard>
  );
}

export function DirectoryViewGrid({
  nodes,
  viewMode = "grid-sm",
}: {
  nodes: TreeNode[];
  viewMode?: ViewMode;
}) {
  const compact = viewMode === "grid-sm";
  const gridClass = gridClasses[viewMode] ?? gridClasses["grid-md"];

  return (
    <div className={gridClass}>
      {nodes.map((node) => {
        const key = `${node.provider}/${node.bucketName}/${node.pathName ?? node.name}`;
        return (
          <FileCardGridItem key={key} node={node} compact={compact} />
        );
      })}
    </div>
  );
}
