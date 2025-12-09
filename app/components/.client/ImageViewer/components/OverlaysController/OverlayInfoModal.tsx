import { AddOverlay } from "./AddOverlay";
import { useNodeInfoModal } from "~/components/DirectoryView/useNodeInfoModal";
import { RouteModal } from "~/components/RouteModal";

const MODAL_REGEX = /action/;

/**
 * Node information modal component.
 * Displays information about the selected overlay and provides an option to remove it.
 */
export default function OverlayInfoModal() {
  const [infoModal, closeInfoModal] = useNodeInfoModal(MODAL_REGEX);

  if (!infoModal) return null;

  return (
    <RouteModal title={infoModal.name} onClose={closeInfoModal}>
      <AddOverlay callback={closeInfoModal} query={infoModal.name} />
    </RouteModal>
  );
}
