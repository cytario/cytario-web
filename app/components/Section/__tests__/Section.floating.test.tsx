import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useEffect, useRef, type ReactNode } from "react";

import { Section } from "../Section";
import { SECTION_GRID_3COL_WIDTH } from "~/components/.client/ImageViewer/components/sidebar/SectionRow/SectionGrid";
import {
  createSidebarStore,
  FLOAT_PANEL_WIDTH,
  type SidebarStoreApi,
} from "~/components/Sidebar/createSidebarStore";
import { Sidebar } from "~/components/Sidebar/Sidebar";

const TITLES = ["Overview", "Views", "Channels"];

function Harness({
  store,
  floatable = true,
  children,
}: {
  store: SidebarStoreApi;
  floatable?: boolean;
  children: ReactNode;
}) {
  const boundsRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boundsRef}>
      <Sidebar
        name="Controls"
        side="right"
        store={store}
        floatable={floatable}
        boundsRef={boundsRef}
      >
        {children}
      </Sidebar>
    </div>
  );
}

function renderSections(options: { floatable?: boolean } = {}) {
  const store = createSidebarStore({ name: `sidebar-${crypto.randomUUID()}` });
  const result = render(
    <Harness store={store} floatable={options.floatable}>
      <Section id="overview" title="Overview" icon="Image">
        <p>overview body</p>
      </Section>
      <Section id="views" title="Views" icon="Columns3" floatWidth={SECTION_GRID_3COL_WIDTH}>
        <p>views body</p>
      </Section>
      <Section
        id="channels"
        title="Channels"
        icon="Microscope"
        floatWidth={SECTION_GRID_3COL_WIDTH}
      >
        <p>channels body</p>
      </Section>
    </Harness>,
  );
  return { store, user: userEvent.setup(), ...result };
}

function scrollContainer() {
  const el = document.querySelector(".overflow-auto");
  if (!(el instanceof HTMLElement)) throw new Error("scroll container not found");
  return el;
}

/** Titles of the rows in sidebar flow order — a floated section leaves its placeholder behind. */
function sidebarRowTitles() {
  return [...scrollContainer().children]
    .filter((child) => child.getAttribute("role") !== "status")
    .map((child) => TITLES.find((title) => child.textContent?.startsWith(title)))
    .filter(Boolean);
}

const panel = (title: string) => screen.getByRole("group", { name: title });

/** The Dock control left behind in the sidebar, as opposed to the floated panel's own. */
function placeholderDockButton(title: string) {
  const floated = panel(title);
  const button = screen
    .getAllByRole("button", { name: `Dock ${title}` })
    .find((candidate) => !floated.contains(candidate));
  if (!button) throw new Error(`no placeholder Dock button for ${title}`);
  return button;
}

describe("Section float/dock", () => {
  test("stays sidebar-only without a floatable sidebar", () => {
    render(
      <Section
        id="channels"
        title="Channels"
        icon="Microscope"
        floatWidth={SECTION_GRID_3COL_WIDTH}
      >
        <p>channels body</p>
      </Section>,
    );

    expect(screen.queryByRole("button", { name: /^Float/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("stays sidebar-only inside a sidebar that is not floatable", async () => {
    const { user } = renderSections({ floatable: false });

    expect(screen.queryByRole("button", { name: /^Float/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();

    // The consolidated handle still serves the accordion (Explorer's path) —
    // and without float controls, the static pillar icon stays.
    const expander = screen.getByRole("button", { name: /Channels/ });
    expect(expander).toHaveAttribute("aria-expanded", "true");
    expect(expander.querySelector(".lucide-microscope")).not.toBeNull();

    await user.click(expander);
    expect(expander).toHaveAttribute("aria-expanded", "false");
    await user.click(expander);
    expect(expander).toHaveAttribute("aria-expanded", "true");
  });

  test("floating switches the section to fixed positioning and group semantics", async () => {
    const { user } = renderSections();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Float Channels" }));

    const floated = panel("Channels");
    expect(floated).toHaveStyle({ position: "fixed" });
    expect(within(floated).getByText("channels body")).toBeInTheDocument();

    await user.click(within(floated).getByRole("button", { name: "Dock Channels" }));

    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.getByText("channels body").closest("[style]")).not.toHaveStyle({
      position: "fixed",
    });
  });

  test("a floated section leaves a placeholder in its slot and docks back into it", async () => {
    const { user } = renderSections();
    expect(sidebarRowTitles()).toEqual(["Overview", "Views", "Channels"]);

    await user.click(screen.getByRole("button", { name: "Float Views" }));
    expect(sidebarRowTitles()).toEqual(["Overview", "Views", "Views", "Channels"]);

    await user.click(placeholderDockButton("Views"));

    expect(sidebarRowTitles()).toEqual(["Overview", "Views", "Channels"]);
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });

  test("keeps focus on the header float control across float and dock", async () => {
    const { user } = renderSections();

    await user.click(screen.getByRole("button", { name: "Float Views" }));
    const headerControl = within(panel("Views")).getByRole("button", { name: "Dock Views" });
    await waitFor(() => expect(headerControl).toHaveFocus());

    await user.click(placeholderDockButton("Views"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Float Views" })).toHaveFocus());
  });

  test("announces transitions only, never the initial render", async () => {
    const { user, rerender, store } = renderSections();
    const status = screen.getAllByRole("status")[0];
    expect(status).toHaveTextContent("");

    rerender(
      <Harness store={store}>
        <Section id="overview" title="Overview" icon="Image">
          <p>overview body</p>
        </Section>
      </Harness>,
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("");

    await user.click(screen.getByRole("button", { name: "Float Overview" }));
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Overview floating");

    await user.click(within(panel("Overview")).getByRole("button", { name: "Dock Overview" }));
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Overview docked");
  });

  test("pointer down on a floated panel brings it to the front", async () => {
    const { user, store } = renderSections();

    await user.click(screen.getByRole("button", { name: "Float Overview" }));
    await user.click(screen.getByRole("button", { name: "Float Channels" }));
    expect(store.getState().sections.channels.z ?? 0).toBeGreaterThan(
      store.getState().sections.overview.z ?? 0,
    );

    await user.pointer({ target: panel("Overview"), keys: "[MouseLeft]" });

    expect(store.getState().sections.overview.z ?? 0).toBeGreaterThan(
      store.getState().sections.channels.z ?? 0,
    );
  });

  test("keyboard focus inside a floated panel raises it (SRS-CY-33308)", () => {
    const { store } = renderSections();

    act(() => {
      store.getState().float("overview", { x: 16, y: 16, width: 320 });
      store.getState().float("channels", { x: 48, y: 48, width: 320 });
    });
    expect(store.getState().sections.channels.z ?? 0).toBeGreaterThan(
      store.getState().sections.overview.z ?? 0,
    );

    act(() => {
      fireEvent.focus(within(panel("Overview")).getByRole("button", { name: "Dock Overview" }));
    });

    expect(store.getState().sections.overview.z ?? 0).toBeGreaterThan(
      store.getState().sections.channels.z ?? 0,
    );
  });

  test("floating width follows the pillar; panels scroll their own overflow", async () => {
    const { user, store } = renderSections();

    await user.click(screen.getByRole("button", { name: "Float Overview" }));
    await user.click(screen.getByRole("button", { name: "Float Views" }));
    await user.click(screen.getByRole("button", { name: "Float Channels" }));

    expect(store.getState().sections.overview?.rect?.width).toBe(FLOAT_PANEL_WIDTH);
    // Pillars with a 3-column SectionGrid spawn one container token step above
    // @lg so the reflow survives panel chrome and scrollbars.
    expect(store.getState().sections.views?.rect?.width).toBe(SECTION_GRID_3COL_WIDTH);
    expect(store.getState().sections.channels?.rect?.width).toBe(SECTION_GRID_3COL_WIDTH);
    const floated = panel("Channels");
    expect(floated).toHaveClass("overflow-y-auto", "backdrop-blur-sm");
  });

  test("arrow keys on the grip move a floating panel, Shift steps 96px, focus stays", async () => {
    // jsdom boxes are 0×0, which clamps every move — hand the harness a real
    // bounds box and park the panel away from the edges first.
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return {
        left: 0,
        top: 0,
        width: 1600,
        height: 900,
        right: 1600,
        bottom: 900,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
    };
    try {
      const { user, store } = renderSections();

      await user.click(screen.getByRole("button", { name: "Float Channels" }));
      act(() => store.getState().float("channels", { x: 500, y: 300, width: 320 }));
      const control = within(panel("Channels")).getByRole("button", { name: "Dock Channels" });
      control.focus();

      await user.keyboard("{ArrowLeft}");
      expect(store.getState().sections.channels?.rect?.x).toBe(476);

      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(store.getState().sections.channels?.rect?.x).toBe(572);

      await user.keyboard("{ArrowUp}");
      expect(store.getState().sections.channels?.rect?.y).toBe(276);

      expect(control).toHaveFocus();
      expect(store.getState().sections.channels?.rect?.width).toBe(320);
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });

  test("floating panels are always expanded — no accordion affordances", async () => {
    const { user } = renderSections();

    await user.click(screen.getByRole("button", { name: "Float Views" }));
    const floated = panel("Views");

    expect(floated.querySelector("[aria-expanded]")).toBeNull();
    const viewsBody = document.getElementById("section-views-content")!;
    expect(viewsBody).not.toHaveAttribute("aria-hidden");
    expect(viewsBody).not.toHaveAttribute("inert");

    // The title is static chrome while floating — clicking it does nothing.
    await user.click(within(floated).getByText("Views"));
    expect(within(floated).getByText("views body")).toBeVisible();
  });

  test("docked sections keep the accordion: expander collapses and restores", async () => {
    const { user } = renderSections();
    const expander = screen.getByRole("button", { name: "Channels" });
    const body = document.getElementById("section-channels-content")!;
    expect(body).not.toHaveAttribute("inert");

    await user.click(expander);
    expect(body).toHaveAttribute("inert");

    await user.click(expander);
    expect(body).not.toHaveAttribute("inert");
  });

  test("float and dock never remount the section's content", async () => {
    let mounts = 0;
    let unmounts = 0;
    const Probe = () => {
      useEffect(() => {
        mounts += 1;
        return () => {
          unmounts += 1;
        };
      }, []);
      return <div data-testid="probe" />;
    };

    const store = createSidebarStore({ name: `sidebar-${crypto.randomUUID()}` });
    const user = userEvent.setup();
    render(
      <Harness store={store}>
        <Section
          id="channels"
          title="Channels"
          icon="Microscope"
          floatWidth={SECTION_GRID_3COL_WIDTH}
        >
          <Probe />
        </Section>
      </Harness>,
    );

    const probe = screen.getByTestId("probe");
    expect(mounts).toBe(1);

    await user.click(screen.getByRole("button", { name: "Float Channels" }));
    await user.click(within(panel("Channels")).getByRole("button", { name: "Dock Channels" }));
    await user.click(screen.getByRole("button", { name: "Float Channels" }));

    expect(mounts).toBe(1);
    expect(unmounts).toBe(0);
    expect(screen.getByTestId("probe")).toBe(probe);
  });
});
