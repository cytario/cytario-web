import { Tab, TabList, Tabs, type Key } from "@cytario/design";

import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsController/ColorPicker";
import { SplitViewToggle } from "../SplitViewToggle";

export function Presets({ children }: { children: React.ReactNode }) {
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
      variant="unstyled"
      selectedKey={String(activeChannelsStateIndex)}
      onSelectionChange={handleSelectionChange}
      className="relative flex flex-col h-full overflow-hidden"
    >
      <div
        className={`
          flex items-center justify-between
          gap-1.5 px-3 pt-4 pb-3
          border-b border-[var(--color-border-default)]
          flex-shrink-0
          relative left-0 right-0
        `}
      >
        <TabList className={"flex gap-1.5"}>
          {[0, 1, 2, 3].map((_, index) => (
            <Tab
              key={index}
              id={String(index)}
              aria-label={`Channels preset ${index + 1}`}
              className={`
                group/tab
                relative overflow-hidden
                flex items-center justify-center
                rounded-sm h-8 min-w-8
                p-0

                border transition-colors
                border-[var(--color-border-strong)]
                bg-[var(--color-surface-muted)]
                data-[hovered]:bg-[var(--color-border-strong)]

                data-[selected]:border-[var(--color-border-focus)]
                data-[selected]:ring-1
                data-[selected]:ring-[var(--color-border-focus)]
                data-[selected]:ring-offset-1
                data-[selected]:ring-offset-[var(--color-surface-default)]
              `}
            >
              <PresetLabel index={index} />
            </Tab>
          ))}
        </TabList>
        <SplitViewToggle />
      </div>

      <div className="relative flex flex-col flex-1 min-h-0 overflow-y-auto pb-60">
        {/* Scrollable content */}
        {children}
      </div>
    </Tabs>
  );
}

const emptyObj = {};

export const PresetLabel = ({ index }: { index: number }) => {
  const layersStates = useViewerStore(select.layersStates);

  const layersState = layersStates[index];
  const presetChannelsOpacity = layersState?.channelsOpacity ?? 1;

  const colors = Object.entries(layersState?.channels ?? emptyObj)
    .filter(([, { isVisible }]) => isVisible)
    .map(([, config]) => rgb(config.color, presetChannelsOpacity));

  // Flatten overlays to CellMarker[]
  const visibleOverlays = Object.values(layersState?.overlays ?? emptyObj)
    .flatMap((overlayState) => Object.values(overlayState))
    .filter((marker) => marker.isVisible);

  return (
    <div className="relative flex flex-col justify-between w-full h-full">
      {/* Number badge */}
      <span
        className={`
          absolute top-0 left-0 px-1 py-px
          text-[10px] font-bold leading-tight
          text-[var(--color-text-secondary)]
          group-data-[selected]/tab:text-[var(--color-text-primary)]
        `}
      >
        {index + 1}
      </span>

      {/* Overlay indicator dots */}
      {visibleOverlays.length > 0 && (
        <div className="absolute top-0.5 right-0.5 flex gap-px">
          {visibleOverlays.slice(0, 4).map((marker, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: rgb(marker.color, 1) }}
            />
          ))}
        </div>
      )}

      {/* Color bars at bottom showing active channels */}
      {colors.length > 0 && (
        <div className="mt-auto flex w-full">
          {colors.map((color, i) => (
            <div
              key={i}
              className="h-1.5 flex-1"
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
