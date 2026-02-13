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
        absolute top-0 left-0 right-4
        flex flex-col items-start 
        p-1
      `}
    >
      {metadata.map((entry) => (
        <div
          key={entry.key}
          className={`
            max-w-full
            text-xs font-bold 
            text-slate-300 p-1
            backdrop-blur-sm
            
          `}
        >
          <TooltipSpan>{entry.value}</TooltipSpan>
        </div>
      ))}
    </div>
  );
};
