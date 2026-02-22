import { IconButton } from "@cytario/design";
import { Filter, FilterX } from "lucide-react";

import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { useFeatureBarStore } from "../FeatureBar/useFeatureBar";

export const ToggleExpander = () => {
  const layersStates = useViewerStore(select.layersStates);

  const isExpanded = useFeatureBarStore((state) => state.isExpanded);
  const setIsExpanded = useFeatureBarStore((state) => state.setIsExpanded);

  return (
    <IconButton
      icon={isExpanded ? Filter : FilterX}
      aria-label={isExpanded ? "Hide disabled channels" : "Show disabled channels"}
      onPress={() => setIsExpanded(!isExpanded)}
      isDisabled={layersStates.length === 0}
    />
  );
};
