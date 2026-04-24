import { Button, EmptyState } from "@cytario/design";
import {
  Database,
  FileArchive,
  Hash,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import {
  Form,
  type MetaFunction,
  useLoaderData,
  useNavigation,
} from "react-router";

import { loader } from "./connectionIndex.loader";
import { authMiddleware } from "~/.server/auth/authMiddleware";
import { requestDurationMiddleware } from "~/.server/requestDurationMiddleware";
import { getCrumbs } from "~/components/Breadcrumbs/getCrumbs";


export const middleware = [requestDurationMiddleware, authMiddleware];

export { loader } from "./connectionIndex.loader";
export { action } from "./connectionIndex.action";

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => [
  {
    title: loaderData
      ? `Index · ${loaderData.connectionName}`
      : "Connection index",
  },
];

export const handle = {
  breadcrumb: (match: {
    params: Record<string, string | undefined>;
  }) => {
    const connectionName = match.params.connectionName ?? "";
    return getCrumbs(`/connectionIndex/${connectionName}`, ["Index"], {
      dataConnectionName: connectionName,
      dataConnectionPath: `/connections/${connectionName}`,
    });
  },
};

export default function ConnectionIndexRoute() {
  const data = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const buttonLabel = data.exists
    ? isSubmitting
      ? "Rebuilding…"
      : "Rebuild index"
    : isSubmitting
      ? "Creating…"
      : "Create index";

  return (
    <div className="flex flex-col gap-6 p-8 max-w-2xl">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          Index · {data.connectionName}
        </h1>
        <p className="text-sm text-slate-500">
          Cytario caches object metadata for this connection in a parquet
          index. The index powers directory browsing and search without
          hitting S3 on every navigation.
        </p>
      </header>

      {data.exists ? (
        <dl className="grid grid-cols-3 gap-4 rounded-lg border border-slate-200 p-6">
          <Stat
            icon={<Hash size={16} />}
            label="Objects"
            value={data.objectCount.toLocaleString()}
          />
          <Stat
            icon={<FileArchive size={16} />}
            label="Size"
            value={formatBytes(data.sizeBytes)}
          />
          <Stat
            icon={<Database size={16} />}
            label="Built"
            value={formatBuiltAt(data.builtAt)}
          />
        </dl>
      ) : (
        <EmptyState
          icon={Database}
          title="No index yet"
          description="This connection has no parquet index. Creating one lets Cytario browse and search its objects without repeated S3 listings."
        />
      )}

      <Form method="POST">
        <Button
          type="submit"
          variant={data.exists ? "secondary" : "primary"}
          isDisabled={isSubmitting}
        >
          {isSubmitting ? (
            <LoaderCircle size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
          {buttonLabel}
        </Button>
      </Form>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="text-lg font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatBuiltAt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}
