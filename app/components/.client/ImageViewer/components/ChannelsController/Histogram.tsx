import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { rgb } from "./ColorPicker";
import { DomainSlider } from "./DomainSlider";
import { HistogramChannel } from "./HistogramChannel";
import { MinMaxSettings } from "./MinMaxSettings";
import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";

export function Histogram() {
  const ref = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(100);
  const height = 160;

  const channelsState = useViewerStore(select.channelsState);
  const selectedChannel = useViewerStore(select.selectedChannel);

  const channelConfigs = useMemo(() => {
    const configs = Object.values(channelsState ?? []);
    if (!selectedChannel) return configs;
    // Sort selectedChannel to render on top
    const filtered = configs.filter((c) => c !== selectedChannel);
    return [...filtered, selectedChannel];
  }, [channelsState, selectedChannel]);

  const allValues = channelConfigs.map((c) => c.histogram).flat();

  const maxValue = Math.max(...allValues);
  const maxLogValue = Math.log(maxValue + 1);
  const maxDomain = Math.max(...channelConfigs.map(({ domain }) => domain[1]));

  // Handle FeatureBar Resize
  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      setWidth(width - 8 - 8);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="top-0 border-b border-slate-500 overflow-hidden ">
      <div className="p-2 pb-0 bg-slate-950 overflow-visible">
        <svg width={width} height={height}>
          {channelConfigs.map(
            ({ histogram, color, contrastLimits, isVisible }, channelIndex) => {
              if (!isVisible) return null;

              return (
                <HistogramChannel
                  key={channelIndex}
                  channelIndex={channelIndex}
                  maxLogValue={maxLogValue}
                  width={width}
                  height={height}
                  range={maxDomain}
                  histogram={histogram}
                  color={rgb(color)}
                  contrastLimit={contrastLimits}
                />
              );
            }
          )}
        </svg>

        <DomainSlider domain={[0, maxDomain]} />
      </div>

      <MinMaxSettings />
    </div>
  );
}
