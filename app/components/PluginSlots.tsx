import { Fragment, useSyncExternalStore, type ComponentType } from "react";

import { slotRegistry } from "./slotRegistry";
import type { Identity, SlotName, SlotProps } from "@cytario/plugin-api";

// Slots are client-only: the welcome overlay / subscription banner must never
// enter the SSR HTML (CSP, no flash of plugin UI before hydration). This guard
// is `false` on the server snapshot and `true` once hydrated on the client.
const subscribe = () => () => {};
const useHasMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );

interface PluginSlotsProps {
  name: SlotName;
  identity: Identity;
}

export function PluginSlots({ name, identity }: PluginSlotsProps) {
  const hasMounted = useHasMounted();
  if (!hasMounted) return null;

  const components = slotRegistry.get(name) as ComponentType<SlotProps>[];

  return (
    <>
      {components.map((Component, index) => (
        <Fragment key={index}>
          <Component identity={identity} />
        </Fragment>
      ))}
    </>
  );
}
