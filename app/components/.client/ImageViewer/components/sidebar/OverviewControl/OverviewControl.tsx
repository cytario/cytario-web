import { Magnifier } from "./Magnifier";
import { ImagePreview } from "../../canvas/ImagePreview";
import { ResetViewStateButton } from "../../canvas/ResetViewStateButton";
import { FeatureItem } from "~/components/FeatureItem/FeatureItem";

/** Sidebar overview: navigation thumbnail + magnification presets + reset. */
export const OverviewControl = () => {
  return (
    <FeatureItem
      title="Overview"
      actions={<ResetViewStateButton />}
      header={
        <div className="block h-60 shrink-0 mx-2 rounded-l overflow-hidden">
          <ImagePreview isInteractive />
        </div>
      }
    >
      <Magnifier />
    </FeatureItem>
  );
};
