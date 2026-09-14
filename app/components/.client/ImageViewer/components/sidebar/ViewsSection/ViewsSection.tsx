import { IconButton } from "@cytario/design";
import { RadioGroup } from "react-aria-components";

import { SplitViewToggle } from "./SplitViewToggle";
import { ViewRadioButton } from "./ViewRadioButton";
import type { ViewKey } from "./ViewStateIcon";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { Divider } from "~/components/Divider/Divider";
import { Section } from "~/components/Section/Section";

/** Sidebar views control: split-panel layout (add/remove panels, assign VCS). */
export function ViewsSection() {
  const activePresetIndex = useViewerStore(select.activePresetIndex);
  const setActivePresetIndex = useViewerStore(select.setActivePresetIndex);
  const layersStates = useViewerStore(select.layersStates);
  const removeChannelsState = useViewerStore(select.removeChannelsState);
  const addChannelsState = useViewerStore(select.addChannelsState);
  const currentUserId = useViewerStore((s) => s.currentUserId);

  function viewStateFor(index: number): ViewKey {
    const ls = layersStates[index];
    if (ls.author !== currentUserId) return "sharedByOthers";
    if (ls.shared) return "sharedByMe";
    return "local";
  }

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
    <ViewRadioButton
      key={index}
      index={index}
      canDelete={layersStates.length > 1}
      viewState={viewStateFor(index)}
      onDelete={() => removeChannelsState(index)}
    />
  );

  return (
    <Section
      pillar="views"
      actions={
        <>
          <IconButton icon="Plus" label="Add view" size="sm" onPress={addChannelsState} />
          <SplitViewToggle />
        </>
      }
    >
      <RadioGroup
        aria-label="Views"
        value={String(activePresetIndex)}
        onChange={(value) => setActivePresetIndex(Number(value))}
        className="flex flex-col gap-4 px-3 pt-2 pb-4 border-b border-border shrink-0"
      >
        {localViews.length > 0 && (
          <section className="flex flex-col gap-2">
            <Divider>My views</Divider>
            {localViews.map(renderItem)}
          </section>
        )}
        {ownSharedViews.length > 0 && (
          <section className="flex flex-col gap-2">
            <Divider>Shared by me</Divider>
            {ownSharedViews.map(renderItem)}
          </section>
        )}
        {peerSharedViews.length > 0 && (
          <section className="flex flex-col gap-2">
            <Divider>Shared with me</Divider>
            {peerSharedViews.map(renderItem)}
          </section>
        )}
      </RadioGroup>
    </Section>
  );
}
