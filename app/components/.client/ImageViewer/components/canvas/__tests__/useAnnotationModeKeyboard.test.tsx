import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

type AnnotationMode = "view" | "draw-polygon" | "draw-freehand" | "draw-point";

type MockStore = {
  getState: () => {
    annotationMode: AnnotationMode;
    setAnnotationMode: (m: AnnotationMode) => void;
  };
};

let mockSetAnnotationMode: ReturnType<typeof vi.fn>;
let mockAnnotationMode: AnnotationMode;
let mockStore: MockStore;

vi.mock("../../../state/store/ViewerStoreContext", async () => {
  const { createContext } = await import("react");
  return { ViewerStoreContext: createContext<MockStore | null>(null) };
});

import { ViewerStoreContext } from "../../../state/store/ViewerStoreContext";
import { useAnnotationModeKeyboard } from "../useAnnotationModeKeyboard";

const wrapper = (store: MockStore) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <ViewerStoreContext.Provider value={store as any}>{children}</ViewerStoreContext.Provider>
  );
  return Wrapper;
};

const fireKey = (key: string, opts: Record<string, unknown> = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    code: key === " " ? "Space" : key,
    bubbles: true,
    cancelable: true,
    ...opts,
  });
  window.dispatchEvent(event);
  return event;
};

const fireKeyUp = (code: string) => {
  window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
};

const fireBlur = () => {
  window.dispatchEvent(new Event("blur"));
};

const createMockStore = (mode: AnnotationMode = "view") => {
  mockAnnotationMode = mode;
  mockSetAnnotationMode = vi.fn((m: AnnotationMode) => {
    mockAnnotationMode = m;
  });
  mockStore = {
    getState: () => ({
      annotationMode: mockAnnotationMode,
      setAnnotationMode: mockSetAnnotationMode,
    }),
  };
  return mockStore;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAnnotationModeKeyboard — Escape", () => {
  it("returns to view mode from a draw mode", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey("Escape");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");
  });

  it("does nothing when already in view mode", () => {
    const store = createMockStore("view");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey("Escape");
    expect(mockSetAnnotationMode).not.toHaveBeenCalled();
  });

  it("returns to view from draw-freehand", () => {
    const store = createMockStore("draw-freehand");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey("Escape");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");
  });

  it("returns to view from draw-point", () => {
    const store = createMockStore("draw-point");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey("Escape");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");
  });
});

describe("useAnnotationModeKeyboard — Space hold", () => {
  it("temporarily enters view from a draw mode on Space down", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey(" ");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");
  });

  it("restores the previous draw mode on Space keyup", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey(" ");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");

    fireKeyUp("Space");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("draw-polygon");
  });

  it("does nothing when already in view mode", () => {
    const store = createMockStore("view");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey(" ");
    expect(mockSetAnnotationMode).not.toHaveBeenCalled();
  });

  it("ignores Space repeat events", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey(" ");
    fireKey(" ", { repeat: true });
    expect(mockSetAnnotationMode).toHaveBeenCalledTimes(1);
  });
});

describe("useAnnotationModeKeyboard — C2-1 stale savedMode race", () => {
  it("does not restore stale mode if changed while Space was held", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey(" ");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");

    // Simulate user clicking a different toolbar button while Space held
    mockAnnotationMode = "draw-freehand";

    fireKeyUp("Space");
    // Should NOT restore "draw-polygon" because mode is no longer "view"
    expect(mockSetAnnotationMode).not.toHaveBeenCalledWith("draw-polygon");
  });
});

describe("useAnnotationModeKeyboard — C2-3 blur during Space hold", () => {
  it("restores saved mode on window blur if Space was held", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireKey(" ");
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("view");

    fireBlur();
    expect(mockSetAnnotationMode).toHaveBeenCalledWith("draw-polygon");
  });

  it("does nothing on blur if Space was not held", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    fireBlur();
    expect(mockSetAnnotationMode).not.toHaveBeenCalled();
  });
});

describe("useAnnotationModeKeyboard — form field guard", () => {
  it("ignores Escape when focus is in an input", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: input });
    window.dispatchEvent(event);

    expect(mockSetAnnotationMode).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("ignores Space when focus is in a textarea", () => {
    const store = createMockStore("draw-polygon");
    renderHook(() => useAnnotationModeKeyboard(), { wrapper: wrapper(store) });

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    const event = new KeyboardEvent("keydown", {
      key: " ",
      code: "Space",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: textarea });
    window.dispatchEvent(event);

    expect(mockSetAnnotationMode).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });
});

describe("useAnnotationModeKeyboard — cleanup", () => {
  it("removes event listeners on unmount", () => {
    const store = createMockStore("draw-polygon");
    const { unmount } = renderHook(() => useAnnotationModeKeyboard(), {
      wrapper: wrapper(store),
    });

    unmount();

    // After unmount, key events should have no effect
    fireKey("Escape");
    expect(mockSetAnnotationMode).not.toHaveBeenCalled();
  });
});
