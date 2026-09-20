import { Magnifier } from "./Magnifier";
import { ImagePreview } from "../../canvas/ImagePreview";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";
import { Section } from "~/components/Section/Section";

/** Sidebar overview: navigation thumbnail + magnification presets + reset. */
export const OverviewSection = () => {
  return (
    <Section id="overview" title="Overview" icon="Image" actions={<ResetViewStateButton />}>
      <div className="block h-44 w-full shrink-0 tall:h-60">
        <ImagePreview isInteractive />
      </div>

      <Magnifier />
    </Section>
  );
};
