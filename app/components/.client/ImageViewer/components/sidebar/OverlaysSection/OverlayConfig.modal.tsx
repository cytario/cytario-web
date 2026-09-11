import { Banner, Button, Input, Select, type SelectItem } from "@cytario/design";
import { useEffect, useMemo, useState } from "react";

import { getOverlayState, markerDisplayLabel } from "./getOverlayState";
import { select } from "../../../state/store/selectors";
import { applyOverlayReconfiguration } from "../../../state/store/slices/viewer.overlays.store";
import { type OverlayConfig, type OverlayEntry } from "../../../state/store/types";
import { useViewerStore } from "../../../state/store/ViewerStoreContext";
import { type ParquetColumn, getParquetSchema } from "~/components/DataGrid/getParquetSchema";
import { RouteModal } from "~/components/RouteModal";
import { getMarkerInfoWasm } from "~/utils/db/getMarkerInfoWasm";
import {
  OVERLAY_CLASS_BIT_LIMIT,
  type OverlayClassConfig,
  type OverlayClassOperator,
  validateOverlayConfig,
} from "~/utils/db/overlayConfig";

const MODE_ITEMS: SelectItem[] = [
  { id: "boolean", name: "Boolean category" },
  { id: "threshold", name: "Intensity threshold" },
];

const OPERATOR_ITEMS: SelectItem[] = [
  { id: ">", name: ">" },
  { id: ">=", name: "≥" },
  { id: "<", name: "<" },
  { id: "<=", name: "≤" },
  { id: "=", name: "=" },
  { id: "!=", name: "≠" },
];

const toSelectItems = (columns: ParquetColumn[]): SelectItem[] =>
  columns.map((col) => ({ id: col.name, name: col.name }));

/** Draft state for one classification row. */
interface ClassDraft {
  sourceColumn: string;
  label: string;
  mode: OverlayClassConfig["mode"];
  operator: OverlayClassOperator;
  threshold: number;
}

const classToDraft = (cls: OverlayClassConfig): ClassDraft => ({
  sourceColumn: cls.sourceColumn,
  label: cls.label,
  mode: cls.mode,
  operator: cls.operator ?? ">",
  threshold: cls.threshold ?? 0,
});

const draftToClass = (draft: ClassDraft): OverlayClassConfig =>
  draft.mode === "threshold"
    ? {
        sourceColumn: draft.sourceColumn,
        label: draft.label,
        mode: "threshold",
        operator: draft.operator,
        threshold: draft.threshold,
      }
    : { sourceColumn: draft.sourceColumn, label: draft.label, mode: draft.mode };

interface OverlayConfigModalProps {
  resourceId: string;
  overlay: OverlayEntry;
  onClose: () => void;
  /** Error surfaced when Apply (or the underlying requery) fails. */
  onApplyError?: (message: string) => void;
}

/**
 * Column-mapping editor for one overlay: cell id / geometry / x / y columns
 * plus per-classification source column, label, and interpretation mode.
 * Continuous-intensity coloring is a follow-up — the mode stays non-selectable.
 */
export function OverlayConfigModal({
  resourceId,
  overlay,
  onClose,
  onApplyError,
}: OverlayConfigModalProps) {
  const updateOverlayConfig = useViewerStore(select.updateOverlayConfig);
  const updateOverlaysState = useViewerStore(select.updateOverlaysState);

  const [schema, setSchema] = useState<ParquetColumn[] | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const config = overlay.config;

  const [idColumn, setIdColumn] = useState(config?.columns.id ?? "");
  const [geomColumn, setGeomColumn] = useState(config?.columns.geometry ?? "");
  const [xColumn, setXColumn] = useState(config?.columns.x ?? "");
  const [yColumn, setYColumn] = useState(config?.columns.y ?? "");
  const [classes, setClasses] = useState<ClassDraft[]>((config?.classes ?? []).map(classToDraft));

  useEffect(() => {
    let cancelled = false;
    getParquetSchema(resourceId)
      .then((cols) => !cancelled && setSchema(cols))
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("Error reading overlay schema:", error);
        setSchemaError(
          error instanceof Error ? error.message : "Could not read the overlay schema.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [resourceId]);

  const columnItems = useMemo(() => (schema ? toSelectItems(schema) : []), [schema]);

  const updateClass = (index: number, patch: Partial<ClassDraft>) =>
    setClasses((prev) => prev.map((cls, i) => (i === index ? { ...cls, ...patch } : cls)));

  const removeClass = (index: number) => setClasses((prev) => prev.filter((_, i) => i !== index));

  const addClass = () =>
    setClasses((prev) => [
      ...prev,
      { sourceColumn: "", label: "", mode: "boolean", operator: ">", threshold: 0 },
    ]);

  const buildConfig = (): OverlayConfig => ({
    version: 1,
    columns: { id: idColumn, geometry: geomColumn, x: xColumn, y: yColumn },
    classes: classes.map(draftToClass),
  });

  const isApplyDisabled =
    !schema ||
    !idColumn ||
    !xColumn ||
    !yColumn ||
    classes.length === 0 ||
    classes.some((cls) => !cls.sourceColumn) ||
    classes.some((cls) => cls.mode === "threshold" && Number.isNaN(cls.threshold)) ||
    (schema ? !validateOverlayConfig(buildConfig(), schema) : true);

  const handleApply = async () => {
    if (!schema) return;
    setIsApplying(true);
    setApplyError(null);
    const nextConfig = buildConfig();
    if (!validateOverlayConfig(nextConfig, schema)) {
      setApplyError(
        "The mapped columns are missing or incompatible with the file schema. Adjust the selection.",
      );
      setIsApplying(false);
      return;
    }
    try {
      const markerInfo = await getMarkerInfoWasm(resourceId, nextConfig);
      const markers = getOverlayState(markerInfo, nextConfig);
      updateOverlaysState(resourceId, markers);
      updateOverlayConfig(resourceId, nextConfig, markers);
      applyOverlayReconfiguration(resourceId);
      onClose();
    } catch (error) {
      console.error("Error applying overlay config:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setApplyError(message);
      onApplyError?.(message);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <RouteModal title="Configure Overlay" onClose={onClose} size="lg" isDismissable={false}>
      <div className="flex flex-col gap-4">
        {schemaError && (
          <Banner variant="warning" title="Schema unavailable">
            {schemaError}
          </Banner>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Cell ID column"
            items={columnItems}
            selectedKey={idColumn || null}
            onSelectionChange={(key) => setIdColumn(String(key ?? ""))}
            isDisabled={!schema}
          />
          <Select
            label="Geometry column"
            items={columnItems}
            selectedKey={geomColumn || null}
            onSelectionChange={(key) => setGeomColumn(String(key ?? ""))}
            isDisabled={!schema}
            description="Optional — points render without geometry."
          />
          <Select
            label="X column"
            items={columnItems}
            selectedKey={xColumn || null}
            onSelectionChange={(key) => setXColumn(String(key ?? ""))}
            isDisabled={!schema}
          />
          <Select
            label="Y column"
            items={columnItems}
            selectedKey={yColumn || null}
            onSelectionChange={(key) => setYColumn(String(key ?? ""))}
            isDisabled={!schema}
          />
        </div>

        <div className="flex flex-col gap-3">
          {classes.map((cls, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-md border border-border p-3">
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label={`Class ${index + 1} source column`}
                  items={columnItems}
                  selectedKey={cls.sourceColumn || null}
                  onSelectionChange={(key) =>
                    updateClass(index, { sourceColumn: String(key ?? "") })
                  }
                  isDisabled={!schema}
                />
                <Input
                  label={`Class ${index + 1} label`}
                  value={cls.label}
                  onChange={(v) => updateClass(index, { label: v })}
                  placeholder={markerDisplayLabel(cls.sourceColumn || "")}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Interpretation mode"
                  items={MODE_ITEMS}
                  selectedKey={cls.mode}
                  onSelectionChange={(key) =>
                    updateClass(index, { mode: String(key) as ClassDraft["mode"] })
                  }
                  isDisabled={!schema}
                  description="Continuous intensity coloring is in development."
                />
                {cls.mode === "threshold" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Select
                      label="Operator"
                      items={OPERATOR_ITEMS}
                      selectedKey={cls.operator}
                      onSelectionChange={(key) =>
                        updateClass(index, { operator: String(key) as OverlayClassOperator })
                      }
                      isDisabled={!schema}
                    />
                    <Input
                      label="Threshold"
                      type="number"
                      value={String(cls.threshold)}
                      onChange={(v) => updateClass(index, { threshold: Number(v) })}
                      isDisabled={!schema}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => removeClass(index)}
                  isDisabled={classes.length === 1}
                >
                  Remove class
                </Button>
              </div>
            </div>
          ))}

          {classes.length >= OVERLAY_CLASS_BIT_LIMIT && (
            <Banner variant="info" title="Class limit reached">
              Only the first {OVERLAY_CLASS_BIT_LIMIT} classes render — the bitmask is 32-bit.
            </Banner>
          )}

          <div className="flex justify-start">
            <Button
              size="sm"
              variant="ghost"
              iconLeft="Plus"
              onPress={addClass}
              isDisabled={!schema || classes.length >= OVERLAY_CLASS_BIT_LIMIT}
            >
              Add class
            </Button>
          </div>
        </div>

        {applyError && (
          <Banner variant="warning" title="Could not apply configuration">
            {applyError}
          </Banner>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onPress={onClose}>
            Cancel
          </Button>
          <Button onPress={handleApply} isDisabled={isApplyDisabled || isApplying}>
            {isApplying ? "Applying…" : "Apply"}
          </Button>
        </div>
      </div>
    </RouteModal>
  );
}
