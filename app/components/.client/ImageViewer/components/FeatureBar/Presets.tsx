import { Tab, TabList, Tabs, type Key } from "@cytario/design";

import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { rgb } from "../ChannelsController/ColorPicker";
import { SplitViewToggle } from "../SplitViewToggle";
import { Tooltip } from "~/components/Tooltip/Tooltip";

const obj = {};

export function Presets({ children }: { children: React.ReactNode }) {
  const layersStates = useViewerStore(select.layersStates);

  const activeChannelsStateIndex = useViewerStore(
    select.activeChannelsStateIndex
  );
  const setActiveChannelsStateIndex = useViewerStore(
    select.setActiveChannelsStateIndex
  );

  const handleSelectionChange = (key: Key) => {
    setActiveChannelsStateIndex(Number(key));
  };

  return (
    <Tabs
      selectedKey={String(activeChannelsStateIndex)}
      onSelectionChange={handleSelectionChange}
      className="relative flex flex-col h-full overflow-hidden"
    >
      <div
        className={`
          flex justify-between
          gap-2 p-2 pt-0
          border-b border-[var(--color-border-strong)]
          flex-shrink-0
          relative left-0 right-0
        `}
      >
        <TabList className={"flex gap-2"}>
          {[0, 1, 2, 3].map((_, index) => {
            const layersState = layersStates[index];
            const presetChannelsOpacity = layersState?.channelsOpacity ?? 1;

            const colors = Object.entries(layersState?.channels ?? obj)
              .filter(([, { isVisible }]) => isVisible)
              .map(([, config]) => rgb(config.color, presetChannelsOpacity));

            // Flatten overlays to CellMarker[]
            // const visibleOverlays = Object.values(layersState?.overlays ?? obj)
            //   .flatMap((overlayState) => Object.values(overlayState))
            //   .filter((marker) => marker.isVisible);

            const background =
              colors.length > 0
                ? `linear-gradient(-45deg, ${colors.join(", ")})`
                : "transparent";

            return (
              <Tooltip
                key={index}
                content={`Select Channels State #${index + 1}`}
              >
                <Tab
                  id={String(index)}
                  className={`
                  group/tab
                  relative
                  flex items-center justify-center
                  rounded-sm h-8 min-w-8
                  p-0

                  border border-[var(--color-border-strong)] data-[selected]:border-[var(--color-text-secondary)]
                  bg-[var(--color-surface-muted)] data-[selected]:bg-[var(--color-text-secondary)]
                  data-[hovered]:bg-[var(--color-border-strong)]
                  text-[var(--color-surface-muted)]
                `}
                  style={{
                    background,
                  }}
                >
                  <PresetLabel index={index} />
                </Tab>
              </Tooltip>
            );
          })}
        </TabList>
        <SplitViewToggle />
      </div>

      <div className="relative flex flex-col h-full overflow-auto pb-60">
        {/* Scrollview */}
        {children}
      </div>
    </Tabs>
  );
}

export const PresetLabel = ({ index }: { index: number }) => {
  const layersStates = useViewerStore(select.layersStates);

  const layersState = layersStates[index];
  const presetChannelsOpacity = layersState?.channelsOpacity ?? 1;

  const colors = Object.entries(layersState?.channels ?? obj)
    .filter(([, { isVisible }]) => isVisible)
    .map(([, config]) => rgb(config.color, presetChannelsOpacity));

  // Flatten overlays to CellMarker[]
  const visibleOverlays = Object.values(layersState?.overlays ?? obj)
    .flatMap((overlayState) => Object.values(overlayState))
    .filter((marker) => marker.isVisible);

  const background =
    colors.length > 0
      ? `linear-gradient(-45deg, ${colors.join(", ")})`
      : "transparent";

  return (
    <div
      className={`
        relative flex items-center justify-center w-full h-full
      `}
      style={{ background }}
    >
      <span
        className={`
                      absolute top-0 left-0 p-0.5
                      flex grow items-center justify-center
                      text-xs font-semibold
                      rounded-br-sm rounded-tr-sm

                      bg-[var(--color-border-strong)]
                      group-data-[selected]/tab:bg-[var(--color-text-secondary)]
                    `}
      >
        {index + 1}
      </span>

      {/* dots for each enabled overlay state */}
      {visibleOverlays.length > 0 && (
        <div className="absolute bottom-0.5 right-0.5">
          {visibleOverlays.slice(0, 4).map((marker, i) => (
            <div
              key={i}
              className={`
                            absolute bottom-0 right-0 
                            w-2 h-2 rounded-full
                            border border-white 
                            
                          `}
              style={{
                backgroundColor: rgb(marker.color, 1),
                right: i * 6,
                bottom: 2,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
