import { twMerge } from "tailwind-merge";

const groupColors = [
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
  "bg-orange-100 text-orange-800",
  "bg-teal-100 text-teal-800",
  "bg-fuchsia-100 text-fuchsia-800",
];

function groupColorClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return groupColors[Math.abs(hash) % groupColors.length];
}

interface GroupPillProps {
  path: string;
  visibleCount?: number;
}

export function GroupPill({ path, visibleCount = 1 }: GroupPillProps) {
  const segments = path.split("/").filter(Boolean);
  const dotCount = Math.max(0, segments.length - visibleCount);
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
              groupColorClass(name),
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
            groupColorClass(segment),
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
