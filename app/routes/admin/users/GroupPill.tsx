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
}

export function GroupPill({ path }: GroupPillProps) {
  const segments = path.split("/");
  const leaf = segments.at(-1) ?? "";
  const parents = segments.slice(0, -1);
  const depth = parents.length;

  return (
    <div className="relative" style={{ marginLeft: depth * 6 }}>
      {parents.map((_, i) => {
        const ancestorName = segments[depth - 1 - i];
        return (
          <div
            key={i}
            className={twMerge(
              "absolute top-0 h-5 w-5 rounded-full border-2 border-white",
              groupColorClass(ancestorName),
            )}
            style={{ left: -(i + 1) * 6, zIndex: depth - i }}
          />
        );
      })}
      <div
        className={twMerge(
          "relative h-5 px-2 rounded-full border-2 text-xs font-medium",
          "border-white",
          groupColorClass(leaf),
        )}
        style={{ zIndex: depth + 1 }}
      >
        {leaf}
      </div>
    </div>
  );
}
