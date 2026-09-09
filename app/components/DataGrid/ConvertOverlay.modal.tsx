import { useSearchParams } from "react-router";

import { AddOverlay } from "~/components/.client/ImageViewer/components/sidebar/OverlaysSection/AddOverlay";
import { RouteModal } from "~/components/RouteModal";

/** CSV to Parquet conversion modal. */
export default function ConvertOverlayModal({
  onClose,
}: {
  onClose: (extraKeys?: string[]) => void;
}) {
  const [searchParams] = useSearchParams();
  const sourceResourceId = searchParams.get("source") ?? undefined;
  const handleClose = () => onClose(["source"]);

  return (
    <RouteModal
      title="Convert CSV to Parquet"
      onClose={handleClose}
      size="lg"
      isDismissable={false}
    >
      <AddOverlay callback={handleClose} extension="csv" sourceResourceId={sourceResourceId} />
    </RouteModal>
  );
}
