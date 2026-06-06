import { Fragment, type ComponentType } from "react";

import { ClientOnly } from "./ClientOnly";
import { slotRegistry } from "./slotRegistry";
import type { Identity, SlotName, SlotProps } from "@cytario/plugin-api";

interface PluginSlotsProps {
  name: SlotName;
  identity: Identity;
}

// Client-only via ClientOnly: plugin overlay/banner must not enter SSR HTML (CSP).
export function PluginSlots({ name, identity }: PluginSlotsProps) {
  const components = slotRegistry.get(name) as ComponentType<SlotProps>[];

  return (
    <ClientOnly>
      {components.map((Component, index) => (
        // Index key OK: registry is append-only (no unregister/reorder).
        <Fragment key={index}>
          <Component identity={identity} />
        </Fragment>
      ))}
    </ClientOnly>
  );
}
