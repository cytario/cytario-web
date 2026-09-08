import { Magnifier } from "./Magnifier";
import { ImagePreview } from "../../canvas/ImagePreview";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";
import { Section } from "~/components/Section/Section";

/** Sidebar overview: navigation thumbnail + magnification presets + reset. */
export const OverviewSection = () => {
  return (
    <Section pillar="overview" actions={<ResetViewStateButton />}>
      <div className="block h-60 w-full shrink-0">
        <ImagePreview isInteractive />
      </div>

      <Magnifier />
    </Section>
  );
};
