import { act, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { useInView } from "../useInView";

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

const observers: { callback: ObserverCallback; observe: ReturnType<typeof vi.fn> }[] = [];

class MockIntersectionObserver {
  constructor(callback: ObserverCallback) {
    observers.push({ callback, observe: vi.fn() });
  }
  observe = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

function Probe() {
  const { ref, isInView } = useInView<HTMLDivElement>();
  return (
    <div ref={ref} data-testid="probe" data-in-view={String(isInView)}>
      {isInView ? "content" : "placeholder"}
    </div>
  );
}

describe("useInView", () => {
  test("starts out of view and flips when intersecting", () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId("probe").dataset.inView).toBe("false");
    expect(getByTestId("probe").textContent).toBe("placeholder");

    act(() => {
      observers[observers.length - 1]!.callback([{ isIntersecting: true } as never]);
    });

    expect(getByTestId("probe").dataset.inView).toBe("true");
    expect(getByTestId("probe").textContent).toBe("content");
  });

  test("flips back when leaving the viewport", () => {
    const { getByTestId } = render(<Probe />);
    const observer = observers[observers.length - 1]!;

    act(() => {
      observer.callback([{ isIntersecting: true } as never]);
    });
    act(() => {
      observer.callback([{ isIntersecting: false } as never]);
    });

    expect(getByTestId("probe").dataset.inView).toBe("false");
  });
});
