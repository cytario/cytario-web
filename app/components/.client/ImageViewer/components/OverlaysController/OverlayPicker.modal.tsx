import { AddOverlay } from "./AddOverlay";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { RouteModal } from "~/components/RouteModal";

/** Overlay file selection modal for parquet files. */
export function LoadOverlayModal({ onClose }: { onClose: () => void }) {
  const addOverlaysState = useViewerStore(select.addOverlaysState);

  return (
    <RouteModal
      title="Select Overlay File"
      onClose={onClose}
      size="lg"
      isDismissable={false}
    >
      <AddOverlay callback={onClose} query="parquet" onOverlayAdd={addOverlaysState} />
    </RouteModal>
  );
}
