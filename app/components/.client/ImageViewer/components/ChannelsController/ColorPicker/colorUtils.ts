import { RGB, RGBA } from "../../../state/store/types";

const HEX6 = /^#?[0-9a-fA-F]{6}$/;

export function isValidHex(hex: string): boolean {
  return HEX6.test(hex.trim());
}

export function hexToRgb(hex: string): RGB | null {
  const trimmed = hex.trim();
  if (!isValidHex(trimmed)) return null;
  const digits = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

export function hexToRgba(hex: string, alpha = 255): RGBA | null {
  const rgb = hexToRgb(hex);
  return rgb ? [...rgb, alpha] : null;
}

export function rgbToHex(color: RGB | RGBA): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(color[0])}${toHex(color[1])}${toHex(color[2])}`;
}
