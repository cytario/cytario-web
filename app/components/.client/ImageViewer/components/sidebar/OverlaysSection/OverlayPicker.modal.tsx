import { AddOverlay } from "./AddOverlay";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { RouteModal } from "~/components/RouteModal";

/** Overlay file selection modal for parquet files. */
export function LoadOverlayModal({ onClose }: { onClose: () => void }) {
  const addOverlaysState = useViewerStore(select.addOverlaysState);
  const resourceId = useViewerStore((s) => s.id);

  return (
    <RouteModal title="Select Overlay File" onClose={onClose} size="lg" isDismissable={false}>
      <AddOverlay
        callback={onClose}
        extension="parquet"
        onOverlayAdd={addOverlaysState}
        sourceResourceId={resourceId}
      />
    </RouteModal>
  );
}
