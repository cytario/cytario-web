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
  test("includes initialized channels regardless of visibility", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true },
        { id: "Green", isVisible: false },
      ]),
    );

    expect(columns.ids).toEqual(["Red", "Green"]);
    expect(columns.selections).toHaveLength(2);
  });

  test("excludes channels that were never initialized", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true },
        { id: "Green", isInitialized: false },
      ]),
    );

    expect(columns.ids).toEqual(["Red"]);
  });

  test("channelsVisible mirrors isVisible while the arrays stay aligned", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true, contrastLimits: [0, 100], color: [255, 0, 0] },
        { id: "Green", isVisible: false, contrastLimits: [0, 200], color: [0, 255, 0] },
        { id: "Blue", isVisible: true, contrastLimits: [0, 300], color: [0, 0, 255] },
      ]),
    );

    expect(columns.channelsVisible).toEqual([true, false, true]);
    expect(columns.ids).toEqual(["Red", "Green", "Blue"]);
    expect(columns.contrastLimits).toEqual([
      [0, 100],
      [0, 200],
      [0, 300],
    ]);
    expect(columns.colors).toEqual([
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    expect(columns.selections.every((selection) => selection.c === 0 && selection.x === 0)).toBe(
      true,
    );
  });

  test("keeps hidden channels out of everything user-visible except their tile data", () => {
    const columns = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true, color: [255, 0, 0] },
        { id: "Green", isVisible: false, color: [0, 255, 0] },
      ]),
    );

    const visibleIndexes = columns.channelsVisible.flatMap((visible, index) =>
      visible ? [index] : [],
    );
    const visibleIds = visibleIndexes.map((index) => columns.ids[index]);
    expect(visibleIds).toEqual(["Red"]);
    expect(visibleIndexes).toHaveLength(columns.selections.length - 1);
  });

  test("toggling visibility off does not change the selections identity", () => {
    const channelsState = makeChannelsState([
      { id: "Red", isVisible: true },
      { id: "Green", isVisible: true },
    ]);
    const before = mapChannelConfigsToState(channelsState);

    const afterVisibilityOff = mapChannelConfigsToState(
      makeChannelsState([
        { id: "Red", isVisible: true },
        { id: "Green", isVisible: false },
      ]),
    );

    expect(afterVisibilityOff.selections).toEqual(before.selections);
    expect(afterVisibilityOff.selections[0]).toBe(before.selections[0]);
    expect(afterVisibilityOff.ids).toEqual(before.ids);
  });

  test("drops hidden channels beyond the viv channel cap once visible ones fill it", () => {
    const entries = Array.from({ length: 11 }, (_, index) => ({
      id: `Channel ${index}`,
      isVisible: index < 10,
    }));
    const columns = mapChannelConfigsToState(makeChannelsState(entries));

    expect(columns.ids).toHaveLength(10);
    expect(columns.ids.every((id) => id !== "Channel 10")).toBe(true);
    expect(columns.selections).toHaveLength(10);
    expect(columns.channelsVisible).toEqual(Array(10).fill(true));
  });

  test("keeps a hidden channel within the cap when fewer than the cap are visible", () => {
    const entries = Array.from({ length: 8 }, (_, index) => ({
      id: `Channel ${index}`,
      isVisible: index === 0,
    }));
    const columns = mapChannelConfigsToState(makeChannelsState(entries));

    expect(columns.ids).toHaveLength(8);
    expect(columns.channelsVisible.filter(Boolean)).toHaveLength(1);
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
