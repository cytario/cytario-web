import { Fragment, type ComponentType } from "react";

import { ClientOnly } from "./ClientOnly";
import { slotRegistry } from "./slotRegistry";
import type { Identity, SlotName, SlotProps } from "@cytario/plugin-api";

interface PluginSlotsProps {
  name: SlotName;
  identity: Identity;
}

// Slots are client-only: the welcome overlay / subscription banner must never
// enter the SSR HTML (CSP, no flash of plugin UI before hydration). `ClientOnly`
// renders nothing until hydrated.
export function PluginSlots({ name, identity }: PluginSlotsProps) {
  const components = slotRegistry.get(name) as ComponentType<SlotProps>[];

  return (
    <ClientOnly>
      {components.map((Component, index) => (
        // Index key is stable: the registry is append-only with no `unregister`.
        // Adding removal/reordering would need a stable per-registration id.
        <Fragment key={index}>
          <Component identity={identity} />
        </Fragment>
      ))}
    </ClientOnly>
  );
}
