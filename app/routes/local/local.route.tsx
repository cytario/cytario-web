import { Suspense, lazy } from "react";
import { useParams } from "react-router";

import { ClientOnly } from "~/components/ClientOnly";
import { buildVirtualNode } from "~/utils/treeNodeFactories";

const LocalViewer = lazy(() =>
  import("~/components/OpenLocalFile/LocalViewer").then((module) => ({
    default: module.LocalViewer,
  })),
);

export const handle = {
  // The picked file's own name, locally marked — shown once, here in the
  // title area, in place of a bucket-file crumb.
  node: (match: { params: Record<string, string | undefined> }) => {
    const encodedName = match.params["*"];
    const fileName = encodedName ? decodeURIComponent(encodedName) : "";
    return buildVirtualNode(fileName ? `Local file · ${fileName}` : "Local file", []);
  },
};

/**
 * The local-file viewer route (`/local/:fileName`). The picked file's name is
 * in the URL; the breadcrumb title shows it once, locally marked, via the
 * route handle.
 */
export default function LocalRoute() {
  const { "*": encodedName } = useParams();
  const fileName = encodedName ? decodeURIComponent(encodedName) : "";

  return (
    <ClientOnly fallback={<div className="h-full" />}>
      <Suspense fallback={<div className="h-full" />}>
        <LocalViewer fileName={fileName} />
      </Suspense>
    </ClientOnly>
  );
}
