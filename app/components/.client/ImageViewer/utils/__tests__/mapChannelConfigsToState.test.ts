import { ChannelsState, Selection } from "../../state/store/types";
import { mapChannelConfigsToState } from "../mapChannelConfigsToState";

const SELECTION: Selection = { c: 0, x: 0, y: 0, z: 0, t: 0 };

const makeChannelsState = (
  entries: Array<{
    id: string;
    isInitialized?: boolean;
    isVisible?: boolean;
    contrastLimits?: [number, number];
    color?: [number, number, number];
  }>,
): ChannelsState =>
  Object.fromEntries(
    entries.map(
      ({
        id,
        isInitialized = true,
        isVisible = false,
        contrastLimits = [0, 255],
        color = [255, 0, 0],
      }) => [
        id,
        {
          selection: SELECTION,
          domain: contrastLimits,
          histogram: [],
          isInitialized,
          isLoading: false,
          isVisible,
          contrastLimits,
          color,
        },
      ],
    ),
  ) as ChannelsState;

describe("mapChannelConfigsToState", () => {
  test("excludes hidden channels even when initialized", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true },
        { id: "Green", isVisible: false },
      ]),
    );

    expect(columns.ids).toEqual(["Red"]);
    expect(columns.selections).toHaveLength(1);
  });

  test("includes a visible channel while its stats are still initializing", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isInitialized: true, isVisible: true },
        { id: "Green", isInitialized: false, isVisible: true },
        { id: "Blue", isInitialized: false, isVisible: false },
      ]),
    );

    // Green is checked on but its initChannelStats fetch has not resolved yet
    // (or failed) — it must still receive a selection so it renders with
    // default contrast instead of silently disappearing from the canvas.
    expect(columns.ids).toEqual(["Red", "Green"]);
    expect(columns.channelsVisible).toEqual([true, true]);
    expect(columns.selections).toHaveLength(2);
  });

  test("keeps the columns aligned in channel order", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true, contrastLimits: [0, 100], color: [255, 0, 0] },
        { id: "Green", isVisible: false, contrastLimits: [0, 200], color: [0, 255, 0] },
        { id: "Blue", isVisible: true, contrastLimits: [0, 300], color: [0, 0, 255] },
      ]),
    );

    expect(columns.ids).toEqual(["Red", "Blue"]);
    expect(columns.channelsVisible).toEqual([true, true]);
    expect(columns.contrastLimits).toEqual([
      [0, 100],
      [0, 300],
    ]);
    expect(columns.colors).toEqual([
      [255, 0, 0],
      [0, 0, 255],
    ]);
    expect(columns.selections.every((selection) => selection.c === 0 && selection.x === 0)).toBe(
      true,
    );
  });

  test("admits at most the viv channel cap, keeping the first visible ones", () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      id: `Channel ${index}`,
      isVisible: true,
    }));
    const columns = mapChannelConfigsToState(makeChannelsState(entries));

    expect(columns.ids).toHaveLength(10);
    expect(columns.ids).not.toContain("Channel 10");
    expect(columns.selections).toHaveLength(10);
  });

  test("returns empty columns when no channel is visible", () => {
    const columns = mapChannelConfigsToState(makeChannelsState([{ id: "Red", isVisible: false }]));

    expect(columns.ids).toEqual([]);
    expect(columns.selections).toEqual([]);
  });

  test("returns empty columns for an empty channels state", () => {
    const columns = mapChannelConfigsToState({});

    expect(columns.ids).toEqual([]);
    expect(columns.channelsVisible).toEqual([]);
    expect(columns.contrastLimits).toEqual([]);
    expect(columns.colors).toEqual([]);
    expect(columns.selections).toEqual([]);
  });
});
