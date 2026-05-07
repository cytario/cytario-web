import type { SupportedDtype } from "@vivjs/types";

export const getDtypeMax = (dtype: SupportedDtype): number => {
  switch (dtype) {
    case "Uint8":
      return 2 ** 8 - 1;
    case "Uint16":
      return 2 ** 16 - 1;
    case "Uint32":
      return 2 ** 32 - 1;
    case "Int8":
      return 2 ** 7 - 1;
    case "Int16":
      return 2 ** 15 - 1;
    case "Int32":
      return 2 ** 31 - 1;
    case "Float32":
    case "Float64":
      return 1;
  }
};

export const getDtypeBitDepth = (dtype: SupportedDtype): number => {
  switch (dtype) {
    case "Uint8":
    case "Int8":
      return 8;
    case "Uint16":
    case "Int16":
      return 16;
    case "Uint32":
    case "Int32":
    case "Float32":
    case "Float64":
      return 32;
  }
};
