import { fireEvent, render, screen } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { describe, expect, test } from "vitest";

import { SettingsSection } from "../SettingsSection";
import { createSidebarStore } from "~/components/Sidebar/createSidebarStore";
import { Sidebar } from "~/components/Sidebar/Sidebar";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

const Harness = ({ children }: { children: ReactNode }) => {
  const boundsRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boundsRef}>
      <Sidebar
        name="Controls"
        side="right"
        store={createSidebarStore({ name: `sidebar-${crypto.randomUUID()}` })}
        boundsRef={boundsRef}
      >
        {children}
      </Sidebar>
    </div>
  );
};

const renderSection = () =>
  render(
    <Harness>
      <SettingsSection />
    </Harness>,
  );

const resetDisplayStore = () =>
  useViewerDisplayStore.setState({
    displayUnit: "metric",
    scaleBarVisible: true,
    rulersVisible: true,
  });

describe("SettingsSection", () => {
  test("renders the scale bar and rulers switches and the display-unit radios", () => {
    resetDisplayStore();
    renderSection();

    expect(screen.getByLabelText("Scale bar")).toBeChecked();
    expect(screen.getByLabelText("Rulers")).toBeChecked();
    expect(screen.getByRole("radiogroup", { name: "Display unit" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Metric" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pixels" })).not.toBeChecked();
  });

  test("the switches toggle scale bar and ruler visibility in the shared store", () => {
    resetDisplayStore();
    renderSection();

    fireEvent.click(screen.getByLabelText("Scale bar"));
    expect(useViewerDisplayStore.getState().scaleBarVisible).toBe(false);
    expect(useViewerDisplayStore.getState().rulersVisible).toBe(true);

    fireEvent.click(screen.getByLabelText("Rulers"));
    expect(useViewerDisplayStore.getState().rulersVisible).toBe(false);
  });

  test("selecting the Pixels radio switches the global display unit", () => {
    resetDisplayStore();
    renderSection();

    fireEvent.click(screen.getByRole("radio", { name: "Pixels" }));
    expect(useViewerDisplayStore.getState().displayUnit).toBe("pixels");
    expect(screen.getByRole("radio", { name: "Pixels" })).toBeChecked();

    fireEvent.click(screen.getByRole("radio", { name: "Metric" }));
    expect(useViewerDisplayStore.getState().displayUnit).toBe("metric");
  });
});
