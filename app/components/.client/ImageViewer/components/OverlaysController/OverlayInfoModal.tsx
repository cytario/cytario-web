import { AddOverlay } from "./AddOverlay";
import { useNodeInfoModal } from "~/components/DirectoryView/useNodeInfoModal";
import { RouteModal } from "~/components/RouteModal";

const MODAL_REGEX = /action/;

const TITLE_MAP: Record<string, string> = {
  "load-overlay": "Select Overlay File",
  "convert-overlay": "Convert CSV to Parquet",
};

/**
 * Overlay file selection modal.
 * Opens when the user clicks "Add Overlay" and allows selecting a parquet
 * (or CSV) file from connected buckets using a searchable tree view.
 */
export function OverlayInfoModal() {
  const [infoModal, closeInfoModal] = useNodeInfoModal(MODAL_REGEX);

  if (!infoModal) return null;

  const title = TITLE_MAP[infoModal.name] ?? infoModal.name;

  return (
    <RouteModal
      title={title}
      onClose={closeInfoModal}
      size="lg"
      isDismissable={false}
    >
      <AddOverlay callback={closeInfoModal} query={infoModal.name} />
    </RouteModal>
  );
}
