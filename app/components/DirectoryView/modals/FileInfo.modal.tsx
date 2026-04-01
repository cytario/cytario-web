import { Button, ButtonLink } from "@cytario/design";
import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router";

import { RouteModal } from "~/components/RouteModal";

export default function FileInfoModal({
  onClose,
}: {
  onClose: (extraKeys?: string[]) => void;
}) {
  const [searchParams] = useSearchParams();
  const { name: connectionName } = useParams();

  const nodeName = searchParams.get("nodeName");

  const handleClose = useCallback(() => {
    onClose(["nodeName"]);
  }, [onClose]);

  if (!nodeName) return null;

  const nodeHref = connectionName
    ? `/connections/${connectionName}/${nodeName}`.replace(/\/$/, "")
    : "#";

  return (
    <RouteModal title={nodeName} onClose={handleClose}>
      <div className="flex flex-row gap-4 justify-between">
        <ButtonLink href={nodeHref} variant="secondary" size="lg">
          Open file
        </ButtonLink>
        <Button size="lg" isDisabled>
          Download file
        </Button>
      </div>
    </RouteModal>
  );
}
