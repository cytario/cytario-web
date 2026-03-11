import { Button, ButtonLink } from "@cytario/design";
import { Form, useParams } from "react-router";

import { RouteModal } from "../RouteModal";
import { CyberduckModal } from "./modals/Cyberduck.modal";
import { useNodeInfoModal } from "./useNodeInfoModal";

const PATTERN = /bucket|directory|file|action/;

/**
 * Node information modal component.
 */
export function NodeInfoModal() {
  const [infoModal, closeInfoModal] = useNodeInfoModal(PATTERN);
  const params = useParams();
  const connectionName = params.name;

  if (!infoModal) return null;

  switch (infoModal.type) {
    case "action":
      return <CyberduckModal />;
    case "directory": {
      const href = connectionName
        ? `/connections/${connectionName}/${infoModal.name}`.replace(/\/$/, "")
        : "#";

      return (
        <RouteModal title={infoModal.name} onClose={closeInfoModal}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink href={href} variant="secondary" size="lg">
              Open {infoModal.type}
            </ButtonLink>
          </div>
        </RouteModal>
      );
    }
    case "file": {
      const href = connectionName
        ? `/connections/${connectionName}/${infoModal.name}`.replace(/\/$/, "")
        : "#";

      return (
        <RouteModal title={infoModal.name} onClose={closeInfoModal}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink href={href} variant="secondary" size="lg">
              Open {infoModal.type}
            </ButtonLink>

            <Button size="lg" isDisabled>
              Download {infoModal.type}
            </Button>
          </div>
        </RouteModal>
      );
    }
    case "bucket": {
      // infoModal.name is the connection name
      const bucketConnectionName = infoModal.name;

      return (
        <RouteModal title={bucketConnectionName} onClose={closeInfoModal}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink
              href={`/connections/${bucketConnectionName}`}
              variant="secondary"
              size="lg"
            >
              Open {infoModal.type}
            </ButtonLink>

            <Form method="delete" action="/">
              <input type="hidden" name="connectionName" value={bucketConnectionName} />
              <Button type="submit" variant="destructive" size="lg">
                Remove Storage Connection
              </Button>
            </Form>
          </div>
        </RouteModal>
      );
    }
    default:
      return null;
  }
}
