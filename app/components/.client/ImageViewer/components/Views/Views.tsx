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
  const currentUserId = useViewerStore((s) => s.currentUserId);

  const handleAdd = () => {
    addChannelsState();
  };

  const localViews = layersStates
    .map((ls, index) => ({ ls, index }))
    .filter(({ ls }) => ls.author === currentUserId && !ls.shared);

  const ownSharedViews = layersStates
    .map((ls, index) => ({ ls, index }))
    .filter(({ ls }) => ls.author === currentUserId && ls.shared);

  const peerSharedViews = layersStates
    .map((ls, index) => ({ ls, index }))
    .filter(({ ls }) => ls.author !== currentUserId);

  const renderItem = ({ index }: { index: number }) => (
    <RadioField key={index} value={String(index)}>
      <ViewRadioButton
        index={index}
        canDelete={layersStates.length > 1}
        isOwnView={layersStates[index]?.author === currentUserId}
        onDelete={() => removeChannelsState(index)}
      />
    </RadioField>
  );

  return (
    <FeatureItem title="Views" actions={<SplitViewToggle />}>
      <RadioGroup
        aria-label="Views"
        value={String(activePresetIndex)}
        onChange={(value) => setActivePresetIndex(Number(value))}
        className={`
          flex flex-col
          gap-4 px-3 pt-2 pb-4
          border-b border-border
          shrink-0
        `}
      >
        {localViews.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className="text-sm ">My local views</span>
            {localViews.map(renderItem)}
          </section>
        )}
        {ownSharedViews.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground px-1">Shared by me</span>
            {ownSharedViews.map(renderItem)}
          </section>
        )}
        {peerSharedViews.length > 0 && (
          <section className="flex flex-col gap-2">
            <span className="text-sm text-muted-foreground px-1">Shared with me</span>
            {peerSharedViews.map(renderItem)}
          </section>
        )}
        <Button size="sm" variant="ghost" iconLeft="Plus" onPress={handleAdd}>
          Add view
        </Button>
      </RadioGroup>
    </FeatureItem>
  );
}
