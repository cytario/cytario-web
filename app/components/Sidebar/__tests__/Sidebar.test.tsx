import { render } from "@testing-library/react";

import { createSidebarStore } from "../createSidebarStore";
import { Sidebar } from "../Sidebar";

function renderSidebar() {
  const store = createSidebarStore({ name: "test-sidebar", defaultOpen: true });
  return render(
    <Sidebar name="Test" side="right" store={store}>
      <div data-testid="tall" style={{ height: 3000 }} />
    </Sidebar>,
  );
}

function scrollContainer() {
  const el = document.querySelector(".overflow-auto");
  if (!(el instanceof HTMLElement)) throw new Error("scroll container not found");
  Object.defineProperty(el, "scrollHeight", { value: 5000, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: 500, configurable: true });
  return el;
}

describe("Sidebar momentum-wheel fallback", () => {
  test("scrolls manually for non-cancelable wheel events", () => {
    renderSidebar();
    const el = scrollContainer();

    const event = new WheelEvent("wheel", { cancelable: false, deltaY: 120 });
    // happy-dom defaults clientHeight/scrollHeight to 0, so scrollTop clamps
    // — assert against the clamped-at-0 baseline by checking it moved from 0
    // when the container is made scrollable via the property stubs above.
    el.dispatchEvent(event);

    expect(el.scrollTop).toBeGreaterThan(0);
  });

  test("leaves cancelable wheel events to native scrolling", () => {
    renderSidebar();
    const el = scrollContainer();

    const event = new WheelEvent("wheel", { cancelable: true, deltaY: 120 });
    el.dispatchEvent(event);

    expect(el.scrollTop).toBe(0);
  });

  test("does not double-apply momentum of a gesture that started on the sidebar", () => {
    // Firefox/macOS native momentum can arrive non-cancelable while the
    // element still scrolls natively — applying its deltas manually too
    // would double the scroll speed. A leading cancelable event marks the
    // session native, so the trailing non-cancelable momentum is left alone.
    renderSidebar();
    const el = scrollContainer();

    el.dispatchEvent(new WheelEvent("wheel", { cancelable: true, deltaY: 120 }));
    el.scrollTop = 240; // native scroll from the first event
    const before = el.scrollTop;
    el.dispatchEvent(new WheelEvent("wheel", { cancelable: false, deltaY: 120 }));

    expect(el.scrollTop).toBe(before);
  });

  test("re-classifies the session after a quiet spell", () => {
    // A hijacked session (gesture that ended on the deck.gl canvas) must not
    // stick: after the momentum settles, a fresh non-cancelable event scrolls
    // again only if no cancelable event claimed the interim — and a fresh
    // native gesture (cancelable first) is never manually scrolled.
    renderSidebar();
    const el = scrollContainer();

    el.dispatchEvent(new WheelEvent("wheel", { cancelable: false, deltaY: 120 }));
    const hijacked = el.scrollTop;
    expect(hijacked).toBeGreaterThan(0);

    el.scrollTop = 0;
    el.dispatchEvent(new WheelEvent("wheel", { cancelable: true, deltaY: 120 }));
    el.dispatchEvent(new WheelEvent("wheel", { cancelable: false, deltaY: 120 }));

    expect(el.scrollTop).toBe(0);
  });
});
