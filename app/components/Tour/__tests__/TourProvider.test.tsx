import { act, render, waitFor } from "@testing-library/react";
import { MemoryRouter, useNavigate, useRouteLoaderData, type NavigateFunction } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TourProvider } from "../TourProvider";
import { useTourProgressStore } from "../useTourProgress";

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ sub: "user-a" }),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return {
    ...actual,
    useRouteLoaderData: vi.fn(),
  };
});

const mockLoaderData = vi.mocked(useRouteLoaderData);

function renderAt(path: string, connectionCount: number) {
  mockLoaderData.mockImplementation((routeId: string) => {
    if (routeId === "routes/layouts/protected.layout") {
      return { connectionConfigs: Array.from({ length: connectionCount }) };
    }
    return undefined;
  });

  let navigate: NavigateFunction | null = null;
  function Navigator() {
    navigate = useNavigate();
    return null;
  }

  render(
    <MemoryRouter initialEntries={[path]}>
      <Navigator />
      {/* Getting-started targets */}
      <aside id="navigation-sidebar" />
      <button data-expander aria-controls="section-connections-content" type="button" />
      <input id="sidebar-search-input" />
      <nav aria-label="Breadcrumb" />
      <div role="radiogroup" aria-label="View mode" />
      <a href="/connections/conn-1">conn-1</a>
      <button aria-label="Help" type="button" />
      {/* Viewer targets */}
      <div id="image-controls-sidebar" />
      <div id="section-channels-title" />
      <input id="min-contrast" />
      <div role="radiogroup" aria-label="Magnification presets" />
      <div id="section-settings-title" />
      <button id="image-controls-toggle" type="button" />
      <TourProvider />
    </MemoryRouter>,
  );

  return {
    navigate: (to: string) => act(() => navigate?.(to)),
  };
}

function firstTooltipTitle(): string | null {
  const tooltip = document.querySelector(".react-joyride__tooltip");
  return tooltip?.textContent ?? null;
}

describe("TourProvider", () => {
  beforeEach(() => {
    localStorage.clear();
    useTourProgressStore.setState({ byUser: {} });
  });

  test("does not start before the settle delay", () => {
    vi.useFakeTimers();
    renderAt("/", 1);
    expect(firstTooltipTitle()).toBeNull();
    vi.useRealTimers();
  });

  test("starts the getting-started tour for a fresh user with connections", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("/", 1);
    vi.advanceTimersByTime(2000);

    await waitFor(() => expect(firstTooltipTitle()).toContain("Welcome to Cytario"));
    vi.useRealTimers();
  });

  test("does not start without connections", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("/", 0);
    vi.advanceTimersByTime(2000);

    expect(firstTooltipTitle()).toBeNull();
    vi.useRealTimers();
  });

  test("does not re-run a completed tour", async () => {
    useTourProgressStore.getState().completeTour("user-a", "getting-started");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("/", 1);
    vi.advanceTimersByTime(2000);

    expect(firstTooltipTitle()).toBeNull();
    vi.useRealTimers();
  });

  test("auto-starting the getting-started tour does not block the viewer tour", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { navigate } = renderAt("/", 1);

    vi.advanceTimersByTime(2000);
    await waitFor(() => expect(firstTooltipTitle()).toContain("Welcome to Cytario"));

    const closeButton = document.querySelector<HTMLButtonElement>('[data-action="close"]');
    closeButton?.click();
    await waitFor(() => expect(document.querySelector(".react-joyride__tooltip")).toBeNull());

    navigate("/connections/conn-1/slide.ome.tif");
    vi.advanceTimersByTime(2000);

    await waitFor(() => expect(firstTooltipTitle()).toContain("This panel"));
    vi.useRealTimers();
  });

  test("records completion when the tour is closed, so it never re-runs", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { navigate } = renderAt("/", 1);

    vi.advanceTimersByTime(2000);
    await waitFor(() => expect(firstTooltipTitle()).toContain("Welcome to Cytario"));

    const closeButton = document.querySelector<HTMLButtonElement>('[data-action="close"]');
    closeButton?.click();
    await waitFor(() => expect(document.querySelector(".react-joyride__tooltip")).toBeNull());

    const completed = useTourProgressStore.getState().byUser["user-a"]?.completed ?? [];
    expect(completed).toContain("getting-started");

    // Leaving and returning to the same route must not resurrect the tour.
    navigate("/recent");
    vi.advanceTimersByTime(2000);
    navigate("/");
    vi.advanceTimersByTime(2000);
    expect(firstTooltipTitle()).toBeNull();
    vi.useRealTimers();
  });

  test("records completion when the tour is advanced through every step", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderAt("/", 1);

    vi.advanceTimersByTime(2000);
    await waitFor(() => expect(firstTooltipTitle()).toContain("Welcome to Cytario"));

    const clickNext = () =>
      document.querySelector<HTMLButtonElement>('[data-action="primary"]')?.click();

    for (let stepIndex = 0; stepIndex < 8; stepIndex += 1) {
      await waitFor(() =>
        expect(
          document.querySelector('.react-joyride__tooltip [data-action="primary"]'),
        ).not.toBeNull(),
      );
      clickNext();
      // Let the step's before hook (frame-settle + target wait) resolve.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      vi.advanceTimersByTime(500);
    }

    await waitFor(() => expect(document.querySelector(".react-joyride__tooltip")).toBeNull());
    const completed = useTourProgressStore.getState().byUser["user-a"]?.completed ?? [];
    expect(completed).toContain("getting-started");
    vi.useRealTimers();
  });
});
