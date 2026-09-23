import type {
  ClickEvent,
  ModeProps,
  SimpleFeatureCollection,
  StartDraggingEvent,
  StopDraggingEvent,
} from "@deck.gl-community/editable-layers";
import { describe, expect, test, vi } from "vitest";

import { StampBoxMode } from "../stampBoxMode";

const createProps = (
  modeConfig: Record<string, unknown> = { dragToDraw: true, stampWidthPx: 100, stampHeightPx: 50 },
): ModeProps<SimpleFeatureCollection> & { onEdit: ReturnType<typeof vi.fn> } =>
  ({
    modeConfig,
    data: { type: "FeatureCollection", features: [] },
    selectedIndexes: [],
    onEdit: vi.fn(),
  }) as never;

describe("StampBoxMode", () => {
  test("a plain click stamps a centered box of the configured level-0 px size", () => {
    const mode = new StampBoxMode();
    const props = createProps();

    mode.handleClick({ mapCoords: [1000, 2000] } as unknown as ClickEvent, props);

    expect(props.onEdit).toHaveBeenCalledTimes(1);
    const [action] = props.onEdit.mock.calls[0];
    expect(action.editType).toBe("addFeature");
    expect(action.updatedData.features[0].geometry.coordinates[0]).toEqual([
      [950, 1975],
      [1050, 1975],
      [1050, 2025],
      [950, 2025],
      [950, 1975],
    ]);
  });

  test("defaults to a 512 px square when no size is configured", () => {
    const mode = new StampBoxMode();
    const props = createProps({ dragToDraw: true });

    mode.handleClick({ mapCoords: [0, 0] } as unknown as ClickEvent, props);

    const [action] = props.onEdit.mock.calls[0];
    expect(action.updatedData.features[0].geometry.coordinates[0][1]).toEqual([256, -256]);
  });

  test("the trailing click after a drag is ignored within the guard window", () => {
    vi.useFakeTimers();
    const mode = new StampBoxMode();
    const props = createProps();

    mode.handleStartDragging(
      { mapCoords: [0, 0], cancelPan: vi.fn() } as unknown as StartDraggingEvent,
      props,
    );
    mode.handleStopDragging({ mapCoords: [10, 10] } as unknown as StopDraggingEvent, props);
    mode.handleClick({ mapCoords: [10, 10] } as unknown as ClickEvent, props);
    expect(props.onEdit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(101);
    mode.handleClick({ mapCoords: [10, 10] } as unknown as ClickEvent, props);
    expect(props.onEdit).toHaveBeenCalledTimes(1);
    expect(props.onEdit.mock.calls[0][0].editType).toBe("addFeature");
    vi.useRealTimers();
  });

  test("drag handlers defer to the parent only under dragToDraw", () => {
    const mode = new StampBoxMode();
    const props = createProps({});

    mode.handleStartDragging({ mapCoords: [0, 0] } as unknown as StartDraggingEvent, props);
    mode.handleStopDragging({ mapCoords: [10, 10] } as unknown as StopDraggingEvent, props);
    mode.handleClick({ mapCoords: [5, 5] } as unknown as ClickEvent, props);

    expect(props.onEdit).toHaveBeenCalledTimes(1);
    const [action] = props.onEdit.mock.calls[0];
    // Without dragToDraw the drag handlers no-op and the click stamps the default square.
    expect(action.updatedData.features[0].geometry.coordinates[0][0]).toEqual([-251, -251]);
  });
});
