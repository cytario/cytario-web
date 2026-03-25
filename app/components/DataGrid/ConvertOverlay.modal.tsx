import { AddOverlay } from "~/components/.client/ImageViewer/components/OverlaysController/AddOverlay";
import { RouteModal } from "~/components/RouteModal";

/** CSV to Parquet conversion modal. */
export default function ConvertOverlayModal({ onClose }: { onClose: () => void }) {
  return (
    <RouteModal
      title="Convert CSV to Parquet"
      onClose={onClose}
      size="lg"
      isDismissable={false}
    >
      <AddOverlay callback={onClose} query="csv" />
    </RouteModal>
  );
}
