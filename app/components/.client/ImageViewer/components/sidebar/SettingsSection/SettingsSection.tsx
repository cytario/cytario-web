import { Switch, Radio, RadioGroup } from "@cytario/design";

import { Section } from "~/components/Section/Section";
import { useViewerDisplayStore } from "~/utils/viewerDisplayStore/useViewerDisplayStore";

const rowClassName = `
  flex items-center justify-between gap-2 px-2 py-1.5
  text-sm text-foreground
`;

/** Viewer display settings: scale bar / ruler visibility and the global display unit. */
export const SettingsSection = () => {
  const displayUnit = useViewerDisplayStore((state) => state.displayUnit);
  const scaleBarVisible = useViewerDisplayStore((state) => state.scaleBarVisible);
  const rulersVisible = useViewerDisplayStore((state) => state.rulersVisible);
  const toggleDisplayUnit = useViewerDisplayStore((state) => state.toggleDisplayUnit);
  const toggleScaleBar = useViewerDisplayStore((state) => state.toggleScaleBar);
  const toggleRulers = useViewerDisplayStore((state) => state.toggleRulers);

  return (
    <Section id="settings" title="Settings" icon="Settings">
      <div className="flex flex-col gap-1 pb-2">
        {/* Scale bar */}
        <div className={rowClassName}>
          <span id="settings-scale-bar-label">Scale bar</span>
          <Switch
            isSelected={scaleBarVisible}
            onChange={toggleScaleBar}
            aria-labelledby="settings-scale-bar-label"
          />
        </div>
        {/* Rulers */}
        <div className={rowClassName}>
          <span id="settings-rulers-label">Rulers</span>
          <Switch
            isSelected={rulersVisible}
            onChange={toggleRulers}
            aria-labelledby="settings-rulers-label"
          />
        </div>

        <div className={rowClassName}>
          <span id="settings-display-unit-label">Display unit</span>
          <RadioGroup
            aria-labelledby="settings-display-unit-label"
            orientation="horizontal"
            value={displayUnit}
            onChange={(value) => {
              if (value !== displayUnit) toggleDisplayUnit();
            }}
            className="flex items-center gap-4"
          >
            <Radio value="metric">Metric</Radio>
            <Radio value="pixels">Pixels</Radio>
          </RadioGroup>
        </div>
      </div>
    </Section>
  );
};
