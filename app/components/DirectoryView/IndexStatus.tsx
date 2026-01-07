import { Tooltip } from "../Tooltip/Tooltip";
import { useIndexStore } from "~/components/DirectoryView/useIndexStore";

interface IndexStatusProps {
  bucketKey: string;
}

export function IndexStatus({ bucketKey }: IndexStatusProps) {
  const indexState = useIndexStore((state) => state.indexes[bucketKey]);

  if (!indexState) {
    return null;
  }

  const { status, progress, objectCount } = indexState;

  switch (status) {
    case "building":
      return (
        <Tooltip
          content={`Indexing... ${progress.loaded.toLocaleString()} objects`}
        >
          <div className="w-4 h-4 rounded-full bg-yellow-500 animate-pulse" />
        </Tooltip>
      );
    case "ready":
      return (
        <Tooltip content={`${objectCount.toLocaleString()} objects indexed`}>
          <div className="w-4 h-4 rounded-full bg-green-500" />
        </Tooltip>
      );
    case "error":
      return (
        <Tooltip content={`Index failed: ${progress.error}`}>
          <div className="w-4 h-4 rounded-full bg-rose-500" />
        </Tooltip>
      );
    case "none":
    default:
      return null;
  }
}
