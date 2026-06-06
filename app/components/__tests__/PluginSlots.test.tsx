import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import type { Identity, SlotProps } from "@cytario/plugin-api";
import { PluginSlots } from "~/components/PluginSlots";
import { slotRegistry } from "~/components/slotRegistry";

const identity: Identity = {
  organization: "testcorp",
  organizationAttributes: { subscription_status: "active" },
  groups: ["lab/team-a"],
  adminScopes: ["*"],
};

describe("PluginSlots", () => {
  beforeEach(() => {
    slotRegistry.__reset();
  });

  test("renders all registered components in order with the identity prop", () => {
    const First = ({ identity: id }: SlotProps) => <div data-testid="first">{id.organization}</div>;
    const Second = ({ identity: id }: SlotProps) => (
      <div data-testid="second">{id.groups.join(",")}</div>
    );
    slotRegistry.register("app-banner", First);
    slotRegistry.register("app-banner", Second);

    render(<PluginSlots name="app-banner" identity={identity} />);

    expect(screen.getByTestId("first")).toHaveTextContent("testcorp");
    expect(screen.getByTestId("second")).toHaveTextContent("lab/team-a");
  });

  test("supports multiple components per slot", () => {
    const A = () => <span data-testid="a" />;
    const B = () => <span data-testid="b" />;
    const C = () => <span data-testid="c" />;
    slotRegistry.register("app-overlay", A);
    slotRegistry.register("app-overlay", B);
    slotRegistry.register("app-overlay", C);

    render(<PluginSlots name="app-overlay" identity={identity} />);

    expect(screen.getAllByTestId(/^[abc]$/)).toHaveLength(3);
  });

  test("renders nothing on the server (SSR-safe)", () => {
    const Banner = () => <div>banner</div>;
    slotRegistry.register("app-banner", Banner);

    const html = renderToString(<PluginSlots name="app-banner" identity={identity} />);

    expect(html).toBe("");
  });
});
