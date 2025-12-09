import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { useFeatureBarStore } from "../FeatureBar/useFeatureBar";
import { IconButton } from "~/components/Controls/IconButton";

export const ToggleExpander = () => {
  const layersStates = useViewerStore(select.layersStates);

  const isExpanded = useFeatureBarStore((state) => state.isExpanded);
  const setIsExpanded = useFeatureBarStore((state) => state.setIsExpanded);

  return (
    <IconButton
      icon={isExpanded ? "Filter" : "FilterX"}
      label={isExpanded ? "Hide disabled channels" : "Show disabled channels"}
      onClick={() => setIsExpanded(!isExpanded)}
      disabled={layersStates.length === 0}
    />
  );
};
