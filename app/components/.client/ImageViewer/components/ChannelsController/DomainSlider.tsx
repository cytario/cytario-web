import Slider from "rc-slider";

import { intensityToRatio, ratioToIntensity } from "./axisScale";
import { rgb } from "./ColorPicker/ColorPicker";
import { select } from "../../state/store/selectors";
import { ByteDomain } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";

export const DomainSlider = ({
  domain,
  logScaleX = false,
}: {
  domain: ByteDomain;
  logScaleX?: boolean;
}) => {
  const selectedChannelId = useViewerStore(select.selectedChannelId);
  const selectedChannel = useViewerStore(select.selectedChannel);
  const setContrastLimits = useViewerStore(select.setContrastLimits);
  const [min, max] = domain;

  const color = selectedChannel ? rgb(selectedChannel.color) : "var(--color-muted-foreground)";

  // The slider operates in normalized [0, 1] ratio space, the same mapping the
  // histogram uses, so handle positions stay aligned under linear or log scaling.
  const toSlider = (value: number) => intensityToRatio(value, max, logScaleX);
  const fromSlider = (value: number) => Math.round(ratioToIntensity(value, max, logScaleX));

  return (
    <div className="h-0">
      {selectedChannel && (
        <Slider
          className="absolute -top-2 flex place-items-center w-full"
          range={true}
          min={toSlider(min)}
          max={toSlider(max)}
          step={logScaleX || max <= 0 ? 0.001 : 1 / max}
          value={selectedChannel.contrastLimits.map(toSlider)}
          onChange={(value: number | number[]) => {
            if (!selectedChannelId) return;
            const [lo, hi] = (value as number[]).map(fromSlider);
            setContrastLimits([lo, hi] as ByteDomain);
          }}
          styles={{
            rail: { backgroundColor: "transparent", height: 1 },
            track: {
              backgroundColor: "var(--color-background)",
              height: 1,
            },
            handle: {
              width: 16,
              height: 16,
              backgroundColor: color,
              borderColor: "var(--color-background)",
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
