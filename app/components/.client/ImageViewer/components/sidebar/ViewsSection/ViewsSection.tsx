import { IconButton } from "@cytario/design";
import { RadioGroup } from "react-aria-components";

import { SplitViewToggle } from "./SplitViewToggle";
import { ViewRadioButton } from "./ViewRadioButton";
import type { ViewKey } from "./ViewStateIcon";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { SECTION_GRID_3COL_WIDTH, SectionGrid } from "../SectionRow/SectionGrid";
import { Section } from "~/components/Section/Section";

/** Sidebar views control: split-panel layout (add/remove panels, assign VCS). */
export function ViewsSection() {
  const activeLayersStateId = useViewerStore(select.activeLayersStateId);
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

  return (
    <Section
      id="views"
      title="Views"
      icon="Columns3"
      floatWidth={SECTION_GRID_3COL_WIDTH}
      actions={
        <>
          <IconButton icon="Plus" label="Add view" size="sm" onPress={addChannelsState} />
          <SplitViewToggle />
        </>
      }
    >
      <RadioGroup
        aria-label="Views"
        value={String(activeLayersStateId)}
        onChange={(value) => setActivePresetIndex(layersStates.findIndex((ls) => ls.id === value))}
      >
        <SectionGrid>
          {layersStates.map((layersState, index) => (
            <ViewRadioButton
              key={layersState.id}
              index={index}
              id={layersState.id}
              canDelete={layersStates.length > 1}
              viewState={viewStateFor(index)}
              onDelete={() => removeChannelsState(index)}
            />
          ))}
        </SectionGrid>
      </RadioGroup>
    </Section>
  );
}
