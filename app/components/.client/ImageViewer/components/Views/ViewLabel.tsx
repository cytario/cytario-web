import { channelsStateForLayer, select } from "../../state/store/selectors";
import { ChannelsState } from "../../state/store/types";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { rgb } from "../ChannelsPanel/ColorPicker/ColorPicker";

const EMPTY_CHANNELS: ChannelsState = Object.freeze({});

export function ViewLabel({ index }: { index: number }) {
  const layersStates = useViewerStore(select.layersStates);

  const layersState = layersStates[index];
  const presetChannelsOpacity = layersState?.channelsOpacity ?? 1;
  const annotationsOpacity = layersState?.annotationsOpacity ?? 1;
  const showAnnotationOutline = layersState?.showAnnotationOutline ?? true;

  const channelsState = useViewerStore(channelsStateForLayer(index)) ?? EMPTY_CHANNELS;
  const colors = Object.entries(channelsState)
    .filter(([, { isVisible }]) => isVisible)
    .map(([, config]) => rgb(config.color, presetChannelsOpacity));

  const visibleOverlays = Object.values(layersState?.overlays ?? EMPTY_CHANNELS)
    .flatMap((overlayState) => Object.values(overlayState))
    .filter((marker) => marker.isVisible);

  const background =
    colors.length > 0 ? `linear-gradient(-45deg, ${colors.join(", ")})` : undefined;

  return (
    <div className="relative flex justify-between h-5 w-5 rounded-full overflow-hidden">
      {colors.length > 0 && <div className="w-full h-full" style={{ background }} />}
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
      {annotationsOpacity > 0 && (
        <div className="absolute bottom-0.5 right-0.5">
          <div
            className={`w-1.5 h-1.5 rounded-full bg-foreground ${showAnnotationOutline ? "ring-1 ring-foreground/40" : ""}`}
            style={{ opacity: annotationsOpacity }}
          />
        </div>
      )}
    </div>
  );
}
