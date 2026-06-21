import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";

import type { HostConfig, Identity, SlotProps } from "@cytario/plugin-api";
import { PluginSlots } from "~/components/PluginSlots";
import { slotRegistry } from "~/components/slotRegistry";

const identity: Identity = {
  organization: "testcorp",
  organizationAttributes: { subscription_status: ["active"] },
  groups: ["lab/team-a"],
  adminScopes: ["*"],
};

const hostConfig: HostConfig = {
  portalUrl: "https://admin.example.test",
  webappUrl: "https://app.example.test",
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
    slotRegistry.scopedFor("test-plugin").register("app-banner", First);
    slotRegistry.scopedFor("test-plugin").register("app-banner", Second);

    render(<PluginSlots name="app-banner" identity={identity} hostConfig={hostConfig} />);

    expect(screen.getByTestId("first")).toHaveTextContent("testcorp");
    expect(screen.getByTestId("second")).toHaveTextContent("lab/team-a");
  });

  test("passes hostConfig to registered components", () => {
    const Cta = ({ hostConfig: cfg }: SlotProps) => (
      <a href={`${cfg.portalUrl}/billing`}>upgrade</a>
    );
    slotRegistry.scopedFor("test-plugin").register("app-banner", Cta);

    render(<PluginSlots name="app-banner" identity={identity} hostConfig={hostConfig} />);

    expect(screen.getByText("upgrade")).toHaveAttribute(
      "href",
      "https://admin.example.test/billing",
    );
  });

  test("supports multiple components per slot", () => {
    const A = () => <span data-testid="a" />;
    const B = () => <span data-testid="b" />;
    const C = () => <span data-testid="c" />;
    slotRegistry.scopedFor("test-plugin").register("app-overlay", A);
    slotRegistry.scopedFor("test-plugin").register("app-overlay", B);
    slotRegistry.scopedFor("test-plugin").register("app-overlay", C);

    render(<PluginSlots name="app-overlay" identity={identity} hostConfig={hostConfig} />);

    expect(screen.getAllByTestId(/^[abc]$/)).toHaveLength(3);
  });

  test("renders nothing on the server (SSR-safe)", () => {
    const Banner = () => <div>banner</div>;
    slotRegistry.scopedFor("test-plugin").register("app-banner", Banner);

    const html = renderToString(
      <PluginSlots name="app-banner" identity={identity} hostConfig={hostConfig} />,
    );

    expect(html).toBe("");
  });
});
