import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, type ReactNode } from "react";

import { Section } from "../Section";
import { createSidebarStore, type SidebarStoreApi } from "~/components/Sidebar/createSidebarStore";
import { Sidebar } from "~/components/Sidebar/Sidebar";

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

function renderSections() {
  const store = createSidebarStore({ name: `sidebar-${crypto.randomUUID()}` });
  render(
    <Harness store={store}>
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
  return { store, user: userEvent.setup() };
}

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {},
  }) as DOMRect;

/**
 * Gives every element the canvas box (0,0 → 1600×900) except the placeholder
 * wrapper, which reports the sidebar column at the canvas's right edge —
 * the drag hit tests resolve against exactly that.
 */
function mockLayoutRects() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (this instanceof HTMLElement && this.className.includes("grow-0")) {
      return rect(1200, 0, 400, 900);
    }
    return rect(0, 0, 1600, 900);
  };
  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

// framer's pan reads pageX/pageY; happy-dom only fills clientX from init.
function pointerEvent(type: string, x: number, y: number) {
  const event = new PointerEvent(type, {
    pointerId: 1,
    isPrimary: true,
    bubbles: true,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pageX", { value: x, configurable: true });
  Object.defineProperty(event, "pageY", { value: y, configurable: true });
  return event;
}

// A real browser commits the detach re-render between pointer events (each a
// separate macrotask) — the placeholder mounting before pointerup is what the
// drop hit tests resolve against. framer defers pan moves through
// requestAnimationFrame, which happy-dom runs on a ~16ms real timer, so each
// event is followed by a settle that lets the gesture frame fire.
const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 50)));

async function drag(el: Element, from: [number, number], to: [number, number], release = true) {
  const move = async (point: [number, number]) => {
    await act(async () => {
      window.dispatchEvent(pointerEvent("pointermove", point[0], point[1]));
    });
    await settle();
  };
  await act(async () => {
    el.dispatchEvent(pointerEvent("pointerdown", from[0], from[1]));
  });
  // framer fires onPanStart with the first move's point and the gesture
  // measures travel from there — a single jump from `from` to `to` would
  // register zero travel. Start the session with a small move, then travel.
  await move([from[0] + 4, from[1] + 1]);
  if (to[0] !== from[0] + 4 || to[1] !== from[1] + 1) await move(to);
  if (release) {
    await act(async () => {
      window.dispatchEvent(pointerEvent("pointerup", to[0], to[1]));
    });
    await settle();
  }
}

const pressEscape = () =>
  act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });

describe("Section drag gestures", () => {
  test("dragging a docked header out detaches at the pointer and commits floating", async () => {
    const restore = mockLayoutRects();
    try {
      const { store } = renderSections();

      await drag(screen.getByText("Channels"), [500, 300], [660, 340]);

      const entry = store.getState().floating.channels;
      expect(entry).toBeDefined();
      expect(entry.rect).toEqual({ x: 660 - 12, y: 340 - 8, width: 576 });
    } finally {
      restore();
    }
  });

  test("a drag-out released over the sidebar column docks back (SRS-CY-33310)", async () => {
    const restore = mockLayoutRects();
    try {
      const { store } = renderSections();

      await drag(screen.getByText("Channels"), [500, 300], [1250, 300]);

      expect(store.getState().floating.channels).toBeUndefined();
    } finally {
      restore();
    }
  });

  test("a small grab-release over the sidebar column keeps the panel floating", async () => {
    const restore = mockLayoutRects();
    try {
      const { store, user } = renderSections();

      await user.click(screen.getByRole("button", { name: "Float Channels" }));
      // Grabbing a floating panel with the pointer over the sidebar column and
      // releasing almost in place must not read as a dock-drop — that is what
      // re-docks a freshly floated panel on its first tiny drag.
      await drag(
        within(screen.getByRole("group", { name: "Channels" })).getByText("Channels"),
        [1250, 20],
        [1258, 24],
      );

      expect(store.getState().floating.channels).toBeDefined();
    } finally {
      restore();
    }
  });

  test("a deliberate drag over the sidebar column docks the panel", async () => {
    const restore = mockLayoutRects();
    try {
      const { store, user } = renderSections();

      await user.click(screen.getByRole("button", { name: "Float Channels" }));
      await drag(
        within(screen.getByRole("group", { name: "Channels" })).getByText("Channels"),
        [1250, 20],
        [1310, 20],
      );

      expect(store.getState().floating.channels).toBeUndefined();
    } finally {
      restore();
    }
  });

  test("Escape mid drag-out docks the detached section back (SDS-CY-011016)", async () => {
    const restore = mockLayoutRects();
    try {
      const { store } = renderSections();

      await drag(screen.getByText("Channels"), [500, 300], [660, 340], false);
      await pressEscape();

      expect(store.getState().floating.channels).toBeUndefined();
    } finally {
      restore();
    }
  });

  test("Escape mid-drag of a floating panel restores its pre-gesture rect", async () => {
    const restore = mockLayoutRects();
    try {
      const { store, user } = renderSections();

      await user.click(screen.getByRole("button", { name: "Float Channels" }));
      const panel = screen.getByRole("group", { name: "Channels" });
      await drag(within(panel).getByText("Channels"), [1250, 20], [700, 300]);
      const before = store.getState().floating.channels.rect;

      await drag(within(panel).getByText("Channels"), [700, 300], [760, 320], false);
      await pressEscape();

      expect(store.getState().floating.channels.rect).toEqual(before);
    } finally {
      restore();
    }
  });

  test("a click after a drag is not swallowed by press suppression", async () => {
    const restore = mockLayoutRects();
    try {
      const { store, user } = renderSections();

      await user.click(screen.getByRole("button", { name: "Float Channels" }));
      const panel = screen.getByRole("group", { name: "Channels" });
      await drag(within(panel).getByText("Channels"), [1250, 20], [1258, 24]);

      await user.click(within(panel).getByRole("button", { name: "Dock Channels" }));

      await waitFor(() => expect(store.getState().floating.channels).toBeUndefined());
    } finally {
      restore();
    }
  });

  test("narrow viewports disable the control and never detach (SRS-CY-33321)", async () => {
    const restore = mockLayoutRects();
    const innerWidth = vi.spyOn(window, "innerWidth", "get");
    innerWidth.mockReturnValue(400);
    try {
      const { store } = renderSections();

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Float Channels" })).toBeDisabled(),
      );

      await drag(screen.getByText("Channels"), [500, 300], [660, 340]);

      expect(store.getState().floating.channels).toBeUndefined();
    } finally {
      innerWidth.mockRestore();
      restore();
    }
  });
});
