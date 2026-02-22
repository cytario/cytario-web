import Slider from "rc-slider";

import { rgb } from "./ColorPicker";
import { select } from "../../state/selectors";
import { ByteDomain } from "../../state/types";
import { useViewerStore } from "../../state/ViewerStoreContext";

export const DomainSlider = ({ domain }: { domain: ByteDomain }) => {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const selectedChannel = useViewerStore(select.selectedChannel);
  const setContrastLimits = useViewerStore(select.setContrastLimits);
  const [min, max] = domain;

  const color = selectedChannel
    ? rgb(selectedChannel.color)
    : "#94a3b8"; // slate-400

  return (
    <div className="h-0">
      {selectedChannel && (
        <Slider
          className="absolute -top-2 flex place-items-center w-full"
          range={true}
          min={min}
          max={max}
          step={1}
          value={selectedChannel.contrastLimits}
          onChange={(value: number | number[]) => {
            if (!selectedChannelId) return;
            setContrastLimits(value as ByteDomain);
          }}
          styles={{
            rail: { backgroundColor: "transparent", height: 1 },
            track: { backgroundColor: "white", height: 1 },
            handle: {
              width: 16,
              height: 16,
              backgroundColor: color,
              borderColor: "white",
              borderWidth: 2,
              boxShadow: "none",
              opacity: 1,
              marginTop: 0,
            },
          }}
        />
      )}
    </div>
  );
};
