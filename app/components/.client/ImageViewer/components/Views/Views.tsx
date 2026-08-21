import { Button } from "@cytario/design";
import { RadioField, RadioGroup } from "react-aria-components";

import { SplitViewToggle } from "./SplitViewToggle";
import { ViewRadioButton } from "./ViewRadioButton";
import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";

export function Views() {
  const activePresetIndex = useViewerStore(select.activePresetIndex);
  const setActivePresetIndex = useViewerStore(select.setActivePresetIndex);
  const layersStates = useViewerStore(select.layersStates);
  const removeChannelsState = useViewerStore(select.removeChannelsState);
  const addChannelsState = useViewerStore(select.addChannelsState);

  const handleAdd = () => {
    addChannelsState();
  };

  return (
    <FeatureItem title="Views" actions={<SplitViewToggle />}>
      <RadioGroup
        aria-label="Views"
        value={String(activePresetIndex)}
        onChange={(value) => setActivePresetIndex(Number(value))}
        className={`
          flex flex-col
          gap-1.5 px-3 pt-2 pb-3
          border-b border-border
          shrink-0
        `}
      >
        {layersStates.map((_, index) => (
          <RadioField key={index} value={String(index)}>
            <ViewRadioButton
              index={index}
              canDelete={layersStates.length > 1}
              onDelete={() => removeChannelsState(index)}
            />
          </RadioField>
        ))}
        <Button size="sm" variant="ghost" iconLeft="Plus" onPress={handleAdd}>
          Add view
        </Button>
      </RadioGroup>
    </FeatureItem>
  );
}
