import { Form } from "react-router";

import { Button, ButtonLink } from "../Controls/Button";
import { RouteModal } from "../RouteModal";
import { CyberduckModal } from "./modals/Cyberduck.modal";
import { useNodeInfoModal } from "./useNodeInfoModal";
import {
  getBucketFromResourceId,
  getPathFromResourceId,
  getProviderFromResourceId,
} from "~/utils/resourceId";

const PATTERN = /bucket|directory|file|action/;

/**
 * Node information modal component.
 */
export function NodeInfoModal() {
  const [infoModal, closeInfoModal] = useNodeInfoModal(PATTERN);

  if (!infoModal) return null;

  switch (infoModal.type) {
    case "action":
      return <CyberduckModal />;
    case "directory":
      return (
        <RouteModal title={infoModal.name} onClose={closeInfoModal}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink
              to={`/buckets/${infoModal.name}`}
              theme="white"
              scale="large"
            >
              Open {infoModal.type}
            </ButtonLink>
          </div>
        </RouteModal>
      );
    case "file":
      return (
        <RouteModal title={infoModal.name} onClose={closeInfoModal}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink
              to={`/buckets/${infoModal.name}`}
              theme="white"
              scale="large"
            >
              Open {infoModal.type}
            </ButtonLink>

            <Button scale="large" disabled>
              Download {infoModal.type}
            </Button>
          </div>
        </RouteModal>
      );
    case "bucket": {
      const provider = getProviderFromResourceId(infoModal.name);
      const bucketName = getBucketFromResourceId(infoModal.name);
      const prefix = getPathFromResourceId(infoModal.name);
      return (
        <RouteModal title={bucketName} onClose={closeInfoModal}>
          <div className="flex flex-row gap-4 justify-between">
            <ButtonLink
              to={`/buckets/${infoModal.name}`}
              theme="white"
              scale="large"
            >
              Open {infoModal.type}
            </ButtonLink>

            <Form method="delete" action="/">
              <input type="hidden" name="provider" value={provider} />
              <input type="hidden" name="bucketName" value={bucketName} />
              <input type="hidden" name="prefix" value={prefix} />
              <Button type="submit" theme="error" scale="large">
                Remove Data Connection
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
