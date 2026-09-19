import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act, useEffect, useRef, type ReactNode } from "react";

import { Section } from "../Section";
import { createSidebarStore, type SidebarStoreApi } from "~/components/Sidebar/createSidebarStore";
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
      <Section pillar="overview">
        <p>overview body</p>
      </Section>
      <Section pillar="views">
        <p>views body</p>
      </Section>
      <Section pillar="channels">
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
      <Section pillar="channels">
        <p>channels body</p>
      </Section>,
    );

    expect(screen.queryByRole("button", { name: /^Float/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  test("stays sidebar-only inside a sidebar that is not floatable", () => {
    renderSections({ floatable: false });

    expect(screen.queryByRole("button", { name: /^Float/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
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
        <Section pillar="overview">
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
    expect(store.getState().floating.channels.z).toBeGreaterThan(
      store.getState().floating.overview.z,
    );

    await user.pointer({ target: panel("Overview"), keys: "[MouseLeft]" });

    expect(store.getState().floating.overview.z).toBeGreaterThan(
      store.getState().floating.channels.z,
    );
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
      expect(store.getState().floating.channels.rect.x).toBe(476);

      await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
      expect(store.getState().floating.channels.rect.x).toBe(572);

      await user.keyboard("{ArrowUp}");
      expect(store.getState().floating.channels.rect.y).toBe(276);

      expect(control).toHaveFocus();
      expect(store.getState().floating.channels.rect.width).toBe(320);
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
        <Section pillar="channels">
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
