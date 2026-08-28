import { Magnifier } from "./Magnifier";
import { ImagePreview } from "../../canvas/ImagePreview";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";

/** Sidebar overview: navigation thumbnail + magnification presets + reset. */
export const OverviewControl = () => {
  return (
    <FeatureItem title="Overview" actions={<ResetViewStateButton />}>
      <div className="block h-60 w-full shrink-0">
        <ImagePreview isInteractive />
      </div>

      <Magnifier />
    </FeatureItem>
  );
};
