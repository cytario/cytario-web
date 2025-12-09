import { useEffect } from "react";

import { select } from "../state/selectors";
import { ViewerStore, ViewState } from "../state/types";
import { useViewerStore } from "../state/ViewerStoreContext";
import { useDirectoryStore } from "~/components/DirectoryView/useDirectoryStore";

export const ViewerHeader = ({
  children,
}: {
  children: (props: {
    metadata: ViewerStore["metadata"] | null;
    viewStateActive: ViewState | null;
    setViewStateActive: (viewState: ViewState) => void;
  }) => JSX.Element;
}) => {
  const setHeaderSlot = useDirectoryStore((s) => s.setHeaderSlot);

  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);

  useEffect(() => {
    if (children) {
      setHeaderSlot(
        children({ metadata, viewStateActive, setViewStateActive })
      );
    }

    return () => {
      setHeaderSlot(null);
    };
  }, [setHeaderSlot, children, metadata, viewStateActive, setViewStateActive]);

  return null;
};
