import type { LucideProps } from "lucide-react";
import type { ComponentType } from "react";

type CameraIconComponent = ComponentType<LucideProps>;

/**
 * The Camera lucide glyph, drawn locally so the capture control needs no
 * registry addition in @cytario/design: `IconValue` accepts any
 * Lucide-shaped component, and this one mirrors lucide's own output
 * (currentColor stroke, viewBox 24, round caps) so it renders identically to
 * the registry icons next to it.
 */
export const CameraIcon: CameraIconComponent = ({
  size = 24,
  strokeWidth = 2,
  ...props
}: LucideProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);
