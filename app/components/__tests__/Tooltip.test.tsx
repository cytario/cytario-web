import { render, screen, fireEvent, act } from "@testing-library/react";
import { vi } from "vitest";

// Unmock Tooltip for this test file - we want to test the real implementation
vi.unmock("~/components/Tooltip/Tooltip");

import { Tooltip } from "~/components/Tooltip/Tooltip";

// Helper to add a tooltip root to the document
function setupTooltipRoot() {
  const root = document.createElement("div");
  root.setAttribute("id", "tooltip");
  document.body.appendChild(root);
  return root;
}

describe("Tooltip", () => {
  let tooltipRoot: HTMLDivElement;

  beforeEach(() => {
    tooltipRoot = setupTooltipRoot();
    vi.useFakeTimers();
  });

  afterEach(() => {
    tooltipRoot.remove();
    vi.useRealTimers();
  });

  test("shows tooltip only after mouse move and delay and remove on mouse out", async () => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    );

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    const button = screen.getByRole("button", { name: "Hover me" });

    act(() => {
      fireEvent.mouseMove(button, { clientX: 100, clientY: 100 });
      vi.advanceTimersByTime(500);
    });

    expect(screen.queryByRole("tooltip")).toBeInTheDocument();

    act(() => {
      fireEvent.mouseLeave(button);
    });

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  test.each([
    [10, 10, "22px", "22px"],
    [1024 - 10, 10, "882px", "22px"],
    [1024 - 10, 768 - 10, "882px", "706px"],
  ])("positions tooltip correctly", async (clientX, clientY, left, top) => {
    render(
      <Tooltip content="Tooltip content">
        <button>Hover me</button>
      </Tooltip>
    );

    const button = screen.getByRole("button", { name: "Hover me" });

    act(() => {
      fireEvent.mouseMove(button, { clientX, clientY });
      vi.advanceTimersByTime(500);
    });

    const tooltip = screen.getByRole("tooltip");

    // Instead of spyOn, override directly and await a rerender
    (tooltip as HTMLElement).getBoundingClientRect = () => ({
      width: 120,
      height: 40,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    await act(async () => {
      fireEvent.mouseMove(button, { clientX, clientY });
    });

    expect(tooltip).toHaveStyle({ left, top });
  });
});
