/**
 * Displays animated placeholder tiles in the top-left corner of the viewport
 * to signal active channel and overlay tile-loading. Each pulsing square
 * represents one outstanding tile request.
 */
export const TileLoaderIndicator = ({
  isChannelsLoading,
  isOverlaysLoading,
}: {
  isChannelsLoading: number;
  isOverlaysLoading: number;
}) => {
  const channelsLoadingTiles = new Array(isChannelsLoading).fill(0);
  const overlaysLoadingTiles = new Array(isOverlaysLoading).fill(0);
  return (
    <div className="absolute top-0 left-0 pointer-events-none">
      <div className="flex">
        {channelsLoadingTiles.map((_, index) => (
          <div
            key={index}
            className="w-2 h-2 rounded-sm m-1 bg-white border border-border animate-pulse"
          />
        ))}
      </div>
      <div className="flex">
        {overlaysLoadingTiles.map((_, index) => (
          <div
            key={index}
            className="w-2 h-2 rounded-sm m-1 bg-white border border-border animate-pulse"
          />
        ))}
      </div>
    </div>
  );
};
