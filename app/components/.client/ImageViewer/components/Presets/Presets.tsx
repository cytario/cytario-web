import { Button } from "@cytario/design";
import { RadioField, RadioGroup } from "react-aria-components";

import { PresetRadioButton } from "./PresetRadioButton";
import { SplitViewToggle } from "./SplitViewToggle";
import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
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
