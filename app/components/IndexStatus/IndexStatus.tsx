import { Icon } from "../Controls/IconButton";
import { useIndexStore } from "~/components/IndexStatus/useIndexStore";

interface IndexStatusProps {
  bucketKey: string;
}

export function IndexStatus({ bucketKey }: IndexStatusProps) {
  const indexState = useIndexStore((state) => state.indexes[bucketKey]);

  if (!indexState) {
    return null;
  }

  const { status, progress, objectCount } = indexState;

  if (status === "none") {
    return null;
  }

  if (status === "building") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon icon="LoaderCircle" size={16} className="animate-spin" />
        <span>Indexing... {progress.loaded.toLocaleString()} objects</span>
      </div>
    );
  }

  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon icon="Database" size={16} />
        <span>{objectCount.toLocaleString()} objects indexed</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-500">
        <Icon icon="CircleAlert" size={16} />
        <span>Index failed: {progress.error}</span>
      </div>
    );
  }

  return null;
}
