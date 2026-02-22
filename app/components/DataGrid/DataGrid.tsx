import { Checkbox } from "@cytario/design";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getParquetRows } from "./getParquetRows";
import { getParquetSchema, ParquetColumn } from "./getParquetSchema";
import { WktSvg } from "./WktSvg";
import { LavaLoader } from "../LavaLoader";
import { useConnectionsStore } from "~/utils/connectionsStore";
import { parseResourceId } from "~/utils/resourceId";

const isWkt = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const upper = value.trim().toUpperCase();
  return upper.startsWith("POLYGON") || upper.startsWith("MULTIPOLYGON");
};

const RIGHT_ALIGNED_COLUMNS = new Set(["object", "x", "y"]);
const PAGE_SIZE = 100;
const ROW_HEIGHT = 48;

export const DataGrid = ({ resourceId }: { resourceId: string }) => {
  const [columns, setColumns] = useState<ParquetColumn[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { provider, bucketName } = parseResourceId(resourceId);
  const storeKey = `${provider}/${bucketName}`;
  const connection = useConnectionsStore(
    (state) => state.connections[storeKey],
  );

  // Initial data fetch
  useEffect(() => {
    const fetchData = async () => {
      const credentials = connection?.credentials;
      const bucketConfig = connection?.bucketConfig;

      if (!credentials) {
        setError(`No credentials available for bucket: ${storeKey}`);
        setLoading(false);
        return;
      }

      try {
        const [schema, data] = await Promise.all([
          getParquetSchema(resourceId, credentials, bucketConfig),
          getParquetRows(resourceId, credentials, PAGE_SIZE, 0, bucketConfig),
        ]);
        setColumns(schema);
        setRows(data);
        setHasMore(data.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [resourceId, storeKey, connection]);

  // Fetch more rows
  const fetchMore = useCallback(async () => {
    if (isFetchingMore || !hasMore) return;

    const credentials = connection?.credentials;
    const bucketConfig = connection?.bucketConfig;
    if (!credentials) return;

    setIsFetchingMore(true);
    try {
      const newRows = await getParquetRows(
        resourceId,
        credentials,
        PAGE_SIZE,
        rows.length,
        bucketConfig,
      );
      setRows((prev) => [...prev, ...newRows]);
      setHasMore(newRows.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to fetch more rows:", err);
    } finally {
      setIsFetchingMore(false);
    }
  }, [
    resourceId,
    connection,
    rows.length,
    isFetchingMore,
    hasMore,
  ]);

  const columnHelper = createColumnHelper<Record<string, unknown>>();

  const tableColumns = useMemo(
    () => [
      columnHelper.display({
        id: "#",
        header: "#",
        cell: (info) => info.row.index + 1,
      }),
      ...columns.map((col) =>
        columnHelper.accessor((row) => row[col.name], {
          id: col.name,
          header: col.name.replace(/^marker_positive_/, ""),
          cell: (info) => {
            const value = info.getValue();
            if (value === null || value === undefined) {
              return <span className="text-gray-400 italic">null</span>;
            }
            if (typeof value === "boolean") {
              return <Checkbox isSelected={value} isDisabled />;
            }
            if (isWkt(value)) {
              return <WktSvg wkt={value} />;
            }
            return String(value);
          },
        }),
      ),
    ],
    [columns, columnHelper],
  );

  const table = useReactTable({
    data: rows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  const { rows: tableRows } = table.getRowModel();
  const columnCount = tableColumns.length;

  // Grid template: narrow # column, then equal width for others
  const gridTemplateColumns = `48px repeat(${columnCount - 1}, minmax(48px, 1fr))`;

  const virtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Fetch more when scrolling near the bottom
  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1];

    if (!lastItem) return;

    if (lastItem.index >= tableRows.length - 10 && hasMore && !isFetchingMore) {
      fetchMore();
    }
  }, [virtualItems, tableRows.length, hasMore, isFetchingMore, fetchMore]);

  if (loading) {
    return <LavaLoader />;
  }

  if (error) {
    return <div className="p-4 text-rose-500">Error: {error}</div>;
  }

  return (
    <div ref={containerRef} className="h-full overflow-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-gray-100 dark:bg-slate-800 sticky top-0 z-10">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              className="grid"
              style={{ gridTemplateColumns }}
            >
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`border-b border-gray-200 dark:border-slate-700 px-4 py-2 font-semibold ${
                    RIGHT_ALIGNED_COLUMNS.has(header.id)
                      ? "text-right"
                      : "text-left"
                  }`}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: "relative",
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = tableRows[virtualRow.index];
            return (
              <tr
                key={row.id}
                className="hover:bg-gray-50 dark:hover:bg-slate-800 absolute w-full grid"
                style={{
                  gridTemplateColumns,
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`border-b border-gray-100 dark:border-slate-700 tabular-nums px-4 flex items-center ${
                      RIGHT_ALIGNED_COLUMNS.has(cell.column.id)
                        ? "justify-end"
                        : ""
                    }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {isFetchingMore && (
        <div className="p-2 text-center text-gray-500">Loading more...</div>
      )}
    </div>
  );
};
