import { EmptyState, IconButtonLink } from "@cytario/design";
import { useMemo, useState } from "react";
import { useParams } from "react-router";

import { SidebarSearchInput } from "./SidebarSearchInput";
import { ConnectionSwitcherChip } from "../ConnectionSwitcherChip";
import { ConnectionTree } from "../ConnectionTree";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export function FeatureItemConnections() {
  const connections = useConnectionsStore(select.connections);
  const routeId = useParams().id;
  const connectionIds = useMemo(() => Object.keys(connections), [connections]);

  const [override, setOverride] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // Reset the manual pick when the route's connection changes, so the tree
  // follows navigation into a different connection (adjust-state-during-render).
  const [prevRouteId, setPrevRouteId] = useState(routeId);
  if (routeId !== prevRouteId) {
    setPrevRouteId(routeId);
    setOverride(null);
  }

  const selectedConnection =
    override ?? (routeId && connectionIds.includes(routeId) ? routeId : connectionIds[0]);

  return (
    <FeatureItem
      title="Connections"
      badge={String(connectionIds.length)}
      actions={
        <IconButtonLink
          href="/connections"
          icon="ArrowRight"
          label="View all connections"
          variant="ghost"
          size="sm"
        />
      }
      header={
        <div className="flex flex-col gap-1 px-2 pb-2">
          <ConnectionSwitcherChip
            selectedConnection={selectedConnection ?? ""}
            onSelect={setOverride}
          />
          <SidebarSearchInput onQueryChange={setQuery} />
        </div>
      }
    >
      {selectedConnection ? (
        <ConnectionTree selectedConnection={selectedConnection} query={query} />
      ) : (
        <EmptyState
          icon="Unplug"
          title="No connections"
          description="No connections are available yet."
        />
      )}
    </FeatureItem>
  );
}
