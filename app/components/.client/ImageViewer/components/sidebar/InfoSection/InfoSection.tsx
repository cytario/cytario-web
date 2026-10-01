import { DescriptionList, EmptyState } from "@cytario/design";

import type { Channel, Image } from "../../../state/store/core/ome.tif.types";
import { useViewerStore } from "../../../state/store/core/ViewerStoreContext";
import { select } from "../../../state/store/selectors";
import { Section } from "~/components/Section/Section";

const BIT_DEPTH: Record<string, string> = {
  Int8: "8-bit",
  Uint8: "8-bit",
  Int16: "16-bit",
  Uint16: "16-bit",
  Int32: "32-bit",
  Uint32: "32-bit",
  Float32: "32-bit float",
  Float64: "64-bit float",
};

const formatWavelength = (w: { Value: number; Unit: string } | undefined) =>
  w ? `${w.Value} ${w.Unit || "nm"}` : undefined;

const channelDetail = (channel: Channel): string | undefined =>
  [
    channel.Fluor && `fluor: ${channel.Fluor}`,
    channel.EmissionWavelength && `Em ${formatWavelength(channel.EmissionWavelength)}`,
    channel.ExcitationWavelength && `Ex ${formatWavelength(channel.ExcitationWavelength)}`,
  ]
    .filter(Boolean)
    .join(" · ") || undefined;

/** Human-readable rows derived from the loaded image metadata; empty fields are omitted. */
const infoRows = (metadata: Image): { label: string; value: string }[] => {
  const { Pixels } = metadata;
  const rows: { label: string; value: string }[] = [];

  if (metadata.Name) rows.push({ label: "Name", value: metadata.Name });

  rows.push({ label: "Image size", value: `${Pixels.SizeX} × ${Pixels.SizeY} px` });

  if (Pixels.PhysicalSizeX != null) {
    const unit = Pixels.PhysicalSizeXUnit || "µm";
    const same = Pixels.PhysicalSizeY == null || Pixels.PhysicalSizeY === Pixels.PhysicalSizeX;
    const y = same ? "" : ` × ${Pixels.PhysicalSizeY} ${Pixels.PhysicalSizeYUnit || "µm"}`;
    rows.push({ label: "Pixel size", value: `${Pixels.PhysicalSizeX} ${unit}${y} / px` });
  }

  if (metadata.AcquisitionDate) rows.push({ label: "Acquired", value: metadata.AcquisitionDate });
  if (metadata.NominalMagnification != null)
    rows.push({ label: "Magnification", value: `${metadata.NominalMagnification}×` });

  rows.push({ label: "Bit depth", value: BIT_DEPTH[Pixels.Type] ?? Pixels.Type });
  rows.push({
    label: "Channels",
    value: String(Pixels.Channels.length || Pixels.SizeC || "—"),
  });

  return rows;
};

/** Sidebar info: structured image properties (C-431), above the raw metadata dump. */
export const InfoSection = () => {
  const metadata = useViewerStore(select.metadata);
  const rows = metadata ? infoRows(metadata) : [];
  const channelRows =
    metadata?.Pixels.Channels.filter(
      (c) => c.Fluor || c.EmissionWavelength || c.ExcitationWavelength,
    ) ?? [];

  return (
    <Section id="info" title="Image Info" icon="Info">
      {metadata ? (
        <>
          <DescriptionList layout="horizontal" className="p-2">
            {rows.map(({ label, value }) => (
              <DescriptionList.Item key={label} label={label}>
                {value}
              </DescriptionList.Item>
            ))}
          </DescriptionList>

          {channelRows.length > 0 && (
            <DescriptionList layout="horizontal" className="p-2">
              {channelRows.map((c, i) => (
                <DescriptionList.Item key={c.ID ?? i} label={c.Name ?? `Channel ${i}`}>
                  {channelDetail(c)}
                </DescriptionList.Item>
              ))}
            </DescriptionList>
          )}
        </>
      ) : (
        <EmptyState
          icon="Info"
          title="No image loaded"
          description="Image properties appear here once a slide is open."
        />
      )}
    </Section>
  );
};
