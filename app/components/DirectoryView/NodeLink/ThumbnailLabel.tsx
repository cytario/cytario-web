import { TooltipSpan } from "../../Tooltip/TooltipSpan";

export interface ThumbnailMeta {
  key: string;
  value: string;
}

export const ThumbnailLabel = ({
  metadata,
}: {
  metadata?: ThumbnailMeta[];
}) => {
  if (!metadata || metadata.length === 0) return null;

  return (
    <div
      className={`
        absolute top-0 left-0 right-0 
        flex flex-col items-start 
        gap-0.5 max-w-1/2 m-1
      `}
    >
      {metadata.map((entry) => (
        <div
          key={entry.key}
          className="px-1 h-4 text-xs font-bold text-slate-700 bg-white/80"
        >
          <TooltipSpan>{entry.value}</TooltipSpan>
        </div>
      ))}
    </div>
  );
};
