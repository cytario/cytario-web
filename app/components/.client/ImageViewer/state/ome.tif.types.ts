import { loadOmeTiff } from "@vivjs/loaders";

import { RGBA } from "./types";

type OmeTiffImage = Awaited<ReturnType<typeof loadOmeTiff>>;

export type Image = OmeTiffImage["metadata"];
export type Loader = OmeTiffImage["data"];

export interface Channel {
  ID: string;
  Name?: string;
  SamplesPerPixel?: number;
  Color?: RGBA;
  EmissionWavelength?: Wavelength;
  ExcitationWavelength?: Wavelength;
  Fluor?: string;
}

interface Wavelength {
  Unit: WavelengthUnit;
  Value: number;
}

export type WavelengthUnit =
  | "Ym"
  | "Zm"
  | "Em"
  | "Pm"
  | "Tm"
  | "Gm"
  | "Mm"
  | "km"
  | "hm"
  | "dam"
  | "m"
  | "dm"
  | "cm"
  | "mm"
  | "µm"
  | "nm"
  | "pm"
  | "fm"
  | "am"
  | "zm"
  | "ym"
  | "Å"
  | "thou"
  | "li"
  | "in"
  | "ft"
  | "yd"
  | "mi"
  | "ua"
  | "ly"
  | "pc"
  | "pt"
  | "pixel"
  | "reference frame";
