import { EmptyState } from "@cytario/design";
import { Unplug } from "lucide-react";
import { useMemo, useState } from "react";
import { useParams } from "react-router";

import { SidebarSearchInput } from "./SidebarSearchInput";
import { ConnectionSwitcherChip } from "../ConnectionSwitcherChip";
import { ConnectionTree } from "../ConnectionTree";
import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

export function ExplorerTab() {
  const connections = useConnectionsStore(select.connections);
  const connectionNames = useMemo(() => Object.keys(connections), [connections]);
  const routeName = useParams().name;

  const [override, setOverride] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const selectedConnection =
    override ??
    (routeName && connectionNames.includes(routeName) ? routeName : connectionNames[0]);

  return (
    <div className="flex flex-col gap-2 overflow-y-auto py-2 h-full">
      {connectionNames.length > 0 ? (
        <>
          <div className="px-2">
            <ConnectionSwitcherChip
              selectedConnection={selectedConnection ?? ""}
              onSelect={setOverride}
            />
          </div>
          <SidebarSearchInput onQueryChange={setQuery} />
          {selectedConnection ? (
            <ConnectionTree selectedConnection={selectedConnection} query={query} />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon={Unplug}
          title="No connections"
          description="No storage connections are available yet."
        />
      )}
    </div>
  );
}
