import { icons as lucideIcons } from "lucide-react";

const lucids = lucideIcons;

export type LucideIconsType = keyof typeof lucideIcons;

export function Icon({
  icon,
  className,
  size = 20,
  strokeWidth = 2,
}: Readonly<{
  icon: LucideIconsType;
  className?: string;
  size?: number;
  strokeWidth?: number;
}>) {
  const I = lucids[icon];

  return (
    <div className={className}>
      <I
        role="img"
        size={size}
        strokeWidth={strokeWidth}
        absoluteStrokeWidth={true}
      />
    </div>
  );
}
