import { ToggleButton } from "@cytario/design";
import type { SupportedDtype } from "@vivjs/types";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { ratioToIntensity } from "./axisScale";
import { rgb } from "./ColorPicker/ColorPicker";
import { DomainSlider } from "./DomainSlider";
import { HistogramChannel } from "./HistogramChannel";
import { MinMaxSettings } from "./MinMaxSettings";
import { select } from "../../state/store/selectors";
import { useViewerStore } from "../../state/store/ViewerStoreContext";
import { getDtypeMax } from "../../utils/getDtypeMax";

export function Histogram() {
  const ref = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(100);
  const [logScaleX, setLogScaleX] = useState(false);
  const logScaleY = true;
  const height = 160;

  const channelsState = useViewerStore(select.channelsState);
  const selectedChannel = useViewerStore(select.selectedChannel);
  const loader = useViewerStore(select.loader);

  const channelConfigs = useMemo(() => {
    const configs = Object.values(channelsState ?? []);
    if (!selectedChannel) return configs;
    // Sort selectedChannel to render on top
    const filtered = configs.filter((c) => c !== selectedChannel);
    return [...filtered, selectedChannel];
  }, [channelsState, selectedChannel]);

  const allValues = channelConfigs.map((c) => c.histogram).flat();

  const maxValue = Math.max(...allValues);

  // Default to the auto-fitted data domain so a low-signal histogram stays
  // readable, but expand the range to include any visible channel's committed
  // contrast max (the Max input clamps to the dtype ceiling, not the domain —
  // see MinMaxSettings / C-232), capped at the dtype value range so the slider
  // handle and axis ticks stay aligned with the input.
  const autoFitMaxDomain = Math.max(...channelConfigs.map(({ domain }) => domain[1]));
  const maxContrastLimit = Math.max(
    ...channelConfigs
      .filter(({ isVisible }) => isVisible)
      .map(({ contrastLimits }) => contrastLimits[1]),
    autoFitMaxDomain,
  );
  const dtypeMax = loader ? getDtypeMax(loader[0].dtype as SupportedDtype) : maxContrastLimit;
  const maxDomain = Math.min(dtypeMax, maxContrastLimit);

  const xTicks = [0, 0.5, 1].map((r) => Math.round(ratioToIntensity(r, maxDomain, logScaleX)));

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
    <div ref={ref} className="relative top-0 overflow-hidden px-3 pt-3">
      <div className="relative p-2 pb-2 bg-[var(--color-surface-subtle)] rounded overflow-visible">
        <div className="absolute right-2 top-2 z-10">
          <ToggleButton
            size="xs"
            variant="outlined"
            className="text-(--color-text-tertiary)"
            aria-label={`Intensity axis scale: ${logScaleX ? "logarithmic" : "linear"}`}
            isSelected={logScaleX}
            onChange={setLogScaleX}
          >
            {logScaleX ? "log" : "lin"}
          </ToggleButton>
        </div>
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

        <DomainSlider domain={[0, maxDomain]} logScaleX={logScaleX} />

        <div className="grid grid-cols-3 text-[10px] leading-loose text-(--color-text-tertiary) tabular-nums">
          <span className="text-left">{xTicks[0]}</span>
          <span className="text-center">{xTicks[1]}</span>
          <span className="text-right">{xTicks[2]}</span>
        </div>
      </div>

      <MinMaxSettings />
    </div>
  );
}
