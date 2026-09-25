import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, useRouteLoaderData } from "react-router";
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

  return render(
    <MemoryRouter initialEntries={[path]}>
      <TourProvider />
    </MemoryRouter>,
  );
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
});
