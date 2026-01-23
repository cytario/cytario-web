export const ThumbnailLabel = ({
  children,
}: {
  children?: string | number;
}) => {
  return (
    <div
      className={`
        absolute top-6 right-2
        flex items-center justify-center
        px-1 h-4 min-w-4
        text-sm font-bold
      text-slate-700 bg-white
      `}
    >
      {children}
    </div>
  );
};
