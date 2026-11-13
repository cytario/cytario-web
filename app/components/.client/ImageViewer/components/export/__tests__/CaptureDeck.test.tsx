import { render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { ViewState } from "../../../state/store/types";
import { CaptureDeck } from "../CaptureDeck";

const viewState = {
  target: [512, 512],
  zoom: 0,
  width: 320,
  height: 240,
  rotationX: 0,
  rotationOrbit: 0,
  minRotationX: -90,
  maxRotationX: 90,
  minZoom: -1,
  maxZoom: 2,
  transitionDuration: 0,
} as unknown as ViewState;

const deckRender = vi.fn();
let afterRenderCallback: (() => void) | null = null;

vi.mock("@deck.gl/react", async () => {
  const React = await import("react");
  // React 19 passes `ref` as a regular prop to function components.
  function MockDeckGL({
    onAfterRender,
    ref,
    ...deckProps
  }: {
    onAfterRender?: () => void;
    ref?: React.Ref<unknown>;
    [key: string]: unknown;
  }) {
    React.useImperativeHandle(ref, () => ({ deck: fakeDeck() }));
    deckRender(deckProps);
    afterRenderCallback = onAfterRender ?? null;
    return React.createElement("div", { "data-testid": "deckgl" });
  }
  return { default: MockDeckGL };
});

const layerInstances: { isLoaded: boolean }[] = [];

vi.mock("../../canvas/useViewerLayers", () => ({
  useViewerLayers: () => ({
    layers: layerInstances,
    effects: [],
    layerFilter: () => true,
  }),
}));

vi.mock("../../canvas/useView", () => ({
  useView: () => ({ id: "detail" }),
}));

vi.mock("../../../state/store/core/ViewerStoreContext", () => ({
  useViewerStore: (selector: (state: { activeImagePanelId: number }) => number) =>
    selector({ activeImagePanelId: 0 }),
}));

const fakeDeck = () => ({
  isInitialized: true,
  getCanvas: () => document.createElement("canvas"),
});

describe("CaptureDeck", () => {
  test("renders a DeckGL sized to the CSS viewport with the capture props", () => {
    layerInstances.length = 0;
    layerInstances.push({ isLoaded: true });
    deckRender.mockClear();

    render(
      <CaptureDeck
        viewState={viewState}
        width={320}
        height={240}
        devicePixels={2}
        onSettled={() => {}}
      />,
    );

    expect(deckRender).toHaveBeenCalledTimes(1);
    const props = deckRender.mock.calls[0][0] as Record<string, unknown>;
    expect(props.width).toBe(320);
    expect(props.height).toBe(240);
    expect(props.useDevicePixels).toBe(2);
    expect(props.controller).toBe(false);
    expect(props.viewState).toEqual({ detail: viewState });
    expect(props.layers).toBe(layerInstances);
  });

  test("settles once every layer reports loaded, delivering the deck canvas", () => {
    layerInstances.length = 0;
    layerInstances.push({ isLoaded: true }, { isLoaded: false });
    deckRender.mockClear();

    const onSettled = vi.fn();
    render(
      <CaptureDeck
        viewState={viewState}
        width={320}
        height={240}
        devicePixels={1}
        onSettled={onSettled}
      />,
    );

    // The afterRender callback is wired through to the deck.
    expect(typeof afterRenderCallback).toBe("function");

    // While a layer is loading, the settle never fires.
    afterRenderCallback?.();
    expect(onSettled).not.toHaveBeenCalled();

    // Once every layer is loaded, the settle fires exactly once — repeated
    // afterRender callbacks never re-settle.
    layerInstances[1].isLoaded = true;
    afterRenderCallback?.();
    afterRenderCallback?.();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  test("hidden mounting keeps the deck out of interaction", () => {
    layerInstances.length = 0;
    layerInstances.push({ isLoaded: true });
    deckRender.mockClear();

    const { container } = render(
      <CaptureDeck
        viewState={viewState}
        width={320}
        height={240}
        devicePixels={1}
        onSettled={() => {}}
        hidden
      />,
    );

    const host = container.firstElementChild as HTMLElement;
    expect(host.getAttribute("aria-hidden")).toBe("true");
    expect(host.style.position).toBe("fixed");
    expect(host.style.pointerEvents).toBe("none");
  });
});
