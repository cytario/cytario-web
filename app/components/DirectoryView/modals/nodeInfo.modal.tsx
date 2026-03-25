import { Button, ButtonLink } from "@cytario/design";
import { useCallback } from "react";
import { Form, useParams, useSearchParams } from "react-router";

import { RouteModal } from "~/components/RouteModal";

/**
 * Node information modal for bucket, directory, and file nodes.
 * Opens via `?modal=node-info&nodeType=file&nodeName=path/to/file`.
 */
export default function NodeInfoModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { name: connectionName } = useParams();

  const nodeType = searchParams.get("nodeType");
  const nodeName = searchParams.get("nodeName");

  const handleClose = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("nodeType");
        next.delete("nodeName");
        return next;
      },
      { replace: true },
    );
    onClose();
  }, [onClose, setSearchParams]);

  if (!nodeType || !nodeName) return null;

  const nodeHref = connectionName
    ? `/connections/${connectionName}/${nodeName}`.replace(/\/$/, "")
    : "#";

  switch (nodeType) {
    case "directory":
      return (
        <RouteModal title={nodeName} onClose={handleClose}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink href={nodeHref} variant="secondary" size="lg">
              Open directory
            </ButtonLink>
          </div>
        </RouteModal>
      );
    case "file":
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
    case "bucket":
      return (
        <RouteModal title={nodeName} onClose={handleClose}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink
              href={`/connections/${nodeName}`}
              variant="secondary"
              size="lg"
            >
              Open bucket
            </ButtonLink>
            <Form method="delete" action="/">
              <input type="hidden" name="connectionName" value={nodeName} />
              <Button type="submit" variant="destructive" size="lg">
                Remove Storage Connection
              </Button>
            </Form>
          </div>
        </RouteModal>
      );
    default:
      return null;
  }
}
