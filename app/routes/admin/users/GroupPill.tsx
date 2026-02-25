import { twMerge } from "tailwind-merge";

import { pillColorClass } from "~/components/Pill";

interface GroupPillProps {
  path: string;
  visibleCount?: number;
}

export function GroupPill({ path, visibleCount }: GroupPillProps) {
  const segments = path.split("/").filter(Boolean);
  const effectiveVisibleCount =
    visibleCount ?? (path.endsWith("/admins") ? 2 : 1);
  const dotCount = Math.max(0, segments.length - effectiveVisibleCount);
  const dotSegments = segments.slice(0, dotCount);
  const visibleSegments = segments.slice(dotCount);

  const fullPath = segments.join(" / ");

  return (
    <div
      className="relative flex"
      style={{ marginLeft: dotCount * 6 }}
      title={dotCount > 0 ? fullPath : undefined}
    >
      {dotSegments.map((_, i) => {
        const name = dotSegments[dotCount - 1 - i];
        return (
          <div
            key={i}
            className={twMerge(
              "absolute top-0 h-5 w-5 rounded-full border-2 border-white",
              pillColorClass(name),
            )}
            style={{ left: -(i + 1) * 6, zIndex: dotCount - i }}
          />
        );
      })}
      {visibleSegments.map((segment, i) => (
        <div
          key={segment}
          className={twMerge(
            "relative h-5 rounded-full border-2 text-xs font-medium border-white",
            pillColorClass(segment),
            i === 0 ? "px-2" : "-ml-1 pl-2.5 pr-2",
          )}
          style={{ zIndex: dotCount + i + 1 }}
        >
          {segment}
        </div>
      ))}
    </div>
  );
}
