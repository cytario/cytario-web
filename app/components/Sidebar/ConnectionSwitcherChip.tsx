import { Select, type SelectItem } from "@cytario/design";
import { useMemo } from "react";

import { select } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";

interface ConnectionSwitcherChipProps {
  selectedConnection: string;
  onSelect: (connectionId: string) => void;
}

export function ConnectionSwitcherChip({
  selectedConnection,
  onSelect,
}: ConnectionSwitcherChipProps) {
  const connections = useConnectionsStore(select.connections);

  const items = useMemo<SelectItem[]>(
    () => Object.keys(connections).map((name) => ({ id: name, name })),
    [connections],
  );

  return (
    <Select
      size="sm"
      aria-label="Select connection"
      items={items}
      value={selectedConnection}
      onChange={(key) => onSelect(String(key))}
    />
  );
}
