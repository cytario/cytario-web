import { ButtonLink, H3, Link } from "@cytario/design";
import { useCallback } from "react";
import { useSearchParams } from "react-router";

import { RouteModal } from "~/components/RouteModal";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export default function CyberduckModal({ onClose }: { onClose: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const connectionId = searchParams.get("connectionId");

  const connectionConfig = useConnectionsStore(
    connectionId ? select.connectionConfig(connectionId) : () => undefined,
  );

  const handleClose = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("connectionId");
        return next;
      },
      { replace: true },
    );
    onClose();
  }, [onClose, setSearchParams]);

  if (!connectionId || !connectionConfig) return null;

  return (
    <RouteModal title="Access with Cyberduck" onClose={handleClose}>
      <p className="text-muted-foreground">
        Cyberduck is a free desktop application that allows you to browse and manage your cloud
        storage files with a familiar file manager interface.
      </p>

      <p className="text-muted-foreground">
        Download a pre-configured connection profile for <strong>{connectionConfig.name}</strong>{" "}
        that will automatically set up your authentication and bucket access in Cyberduck.
      </p>

      <div className="bg-card border border-border rounded-sm px-4 py-2 flex flex-col gap-2">
        <H3 className="text-lg font-normal">Quick Start</H3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li>
            Download and install{" "}
            <Link href="https://cyberduck.io/download/" target="_blank" rel="noopener noreferrer">
              Cyberduck
            </Link>{" "}
            (version 8.7.0 or later)
          </li>
          <li>Download the connection profile below</li>
          <li>Double-click the downloaded profile to add it to Cyberduck</li>
          <li>Connect and authenticate when prompted</li>
        </ol>
      </div>

      <ButtonLink
        href={`/api/cyberduck-profile/${connectionId}`}
        variant="primary"
        size="lg"
        iconLeft="Download"
        download
      >
        Download Cyberduck Profile
      </ButtonLink>
    </RouteModal>
  );
}
