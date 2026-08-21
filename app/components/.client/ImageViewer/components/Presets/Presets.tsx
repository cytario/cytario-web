import { Button, IconButton, MenuItem, useContextMenu } from "@cytario/design";
import { RadioButton, RadioField, RadioGroup } from "react-aria-components";

import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsPanel/ColorPicker/ColorPicker";
import { SplitViewToggle } from "../SplitViewToggle";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";

export function Presets() {
  const activeChannelsStateIndex = useViewerStore(select.activeChannelsStateIndex);
  const setActiveChannelsStateIndex = useViewerStore(select.setActiveChannelsStateIndex);
  const layersStates = useViewerStore(select.layersStates);
  const removeChannelsState = useViewerStore(select.removeChannelsState);

  const handleAdd = () => {
    setActiveChannelsStateIndex(layersStates.length);
  };

  return (
    <FeatureItem title="Presets" actions={<SplitViewToggle />}>
      <RadioGroup
        value={String(activeChannelsStateIndex)}
        onChange={(value) => setActiveChannelsStateIndex(Number(value))}
        className={`
          flex flex-col
          gap-1.5 px-3 pt-2 pb-3
          border-b border-border
          shrink-0
        `}
      >
        {layersStates.map((_, index) => (
          <RadioField key={index} value={String(index)}>
            <PresetRadioButton
              index={index}
              canDelete={layersStates.length > 1}
              onDelete={() => removeChannelsState(index)}
            />
          </RadioField>
        ))}
        <Button size="sm" variant="ghost" iconLeft="Plus" onPress={handleAdd}>
          Add preset
        </Button>
      </RadioGroup>
    </FeatureItem>
  );
}

function PresetRadioButton({
  index,
  canDelete,
  onDelete,
}: {
  index: number;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const ctx = useContextMenu({
    content: (
      <MenuItem id="delete" icon="Trash2" isDanger isDisabled={!canDelete} onAction={onDelete}>
        Delete preset
      </MenuItem>
    ),
  });

  return (
    <>
      <div className="flex items-center gap-1">
        <RadioButton
          {...ctx.targetProps}
          aria-label={`Channels preset ${index + 1}`}
          className={`
            group/radio-btn
            relative overflow-hidden
            flex items-center justify-center
            rounded-sm h-8
            p-0
            flex-1

            border transition-colors
            border-border
            bg-muted
            data-hovered:bg-border

            data-selected:border-ring
            data-selected:ring-1
            data-selected:ring-ring
            data-selected:ring-offset-1
            data-selected:ring-offset-background
          `}
        >
          <PresetLabel index={index} />
          <span>{index + 1}</span>
        </RadioButton>
        <IconButton
          {...ctx.triggerProps}
          icon="EllipsisVertical"
          label={`Actions for preset ${index + 1}`}
          variant="ghost"
          size="xs"
        />
      </div>
      {ctx.menu}
    </>
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

  const visibleOverlays = Object.values(layersState?.overlays ?? emptyObj)
    .flatMap((overlayState) => Object.values(overlayState))
    .filter((marker) => marker.isVisible);

  return (
    <div className="relative flex justify-between h-6 w-6">
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
      {colors.length > 0 && (
        <div className="w-full h-full">
          {colors.map((color, i) => (
            <div key={i} className="h-full flex-1" style={{ backgroundColor: color }} />
          ))}
        </div>
      )}
    </div>
  );
};
