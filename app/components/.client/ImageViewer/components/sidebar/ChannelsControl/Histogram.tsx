import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { countToRatio, intensityToRatio } from "./axisScale";
import { AxisTicks } from "./AxisTicks";
import { rgb } from "./ColorPicker/ColorPicker";
import { DomainSlider } from "./DomainSlider";
import { HistogramChannel } from "./HistogramChannel";
import { MinMaxSettings } from "./MinMaxSettings";
import { select } from "../../../state/store/selectors";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";

export function Histogram() {
  const ref = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(100);
  const [logScaleX, setLogScaleX] = useState(false);
  const logScaleY = true;
  const height = 160;

  const channelsState = useViewerStore(select.channelsState);
  const selectedChannel = useViewerStore(select.selectedChannel);

  const channelConfigs = useMemo(() => {
    const configs = Object.values(channelsState ?? []);
    if (!selectedChannel) return configs;
    const filtered = configs.filter((c) => c !== selectedChannel);
    return [...filtered, selectedChannel];
  }, [channelsState, selectedChannel]);

  const allValues = channelConfigs.map((c) => c.histogram).flat();

  const maxValue = Math.max(...allValues);
  const maxDomain = Math.max(...channelConfigs.map(({ domain }) => domain[1]));

  useLayoutEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      setWidth(width);
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={ref} className="relative mx-6">
        <svg width={width} height={height}>
          {channelConfigs.map(({ histogram, color, contrastLimits, isVisible }, channelIndex) => {
            if (!isVisible) return null;

            return (
              <HistogramChannel
                key={channelIndex}
                channelIndex={channelIndex}
                maxValue={maxValue}
                logScaleX={logScaleX}
                logScaleY={logScaleY}
                width={width}
                height={height}
                range={maxDomain}
                histogram={histogram}
                color={rgb(color)}
                contrastLimit={contrastLimits}
              />
            );
          })}
        </svg>
        <AxisTicks
          orientation="y"
          max={maxValue}
          log={logScaleY}
          toRatio={(v) => countToRatio(v, maxValue, logScaleY)}
        />

        <DomainSlider domain={[0, maxDomain]} logScaleX={logScaleX} />

        <AxisTicks
          orientation="x"
          max={maxDomain}
          log={logScaleX}
          toRatio={(v) => intensityToRatio(v, maxDomain, logScaleX)}
        />
      </div>
      <MinMaxSettings logScaleX={logScaleX} setLogScaleX={setLogScaleX} />
    </>
  );
}
