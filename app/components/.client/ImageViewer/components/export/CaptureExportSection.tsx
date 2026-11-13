import {
  Button,
  Checkbox,
  Icon,
  SegmentedControl,
  SegmentedControlItem,
  Spinner,
  useToast,
} from "@cytario/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CameraIcon } from "./CameraIcon";
import { commitExportAnnotation } from "./commitExportAnnotation";
import {
  RESOLUTION_PRESETS,
  type ExportDecorations,
  type ResolutionPreset,
} from "./composeCapture";
import { copyExportToClipboard, downloadExport } from "./composeCapture";
import { scaleBarLabelForPixelSize } from "./decorations";
import { frameCurrentView, frameRegion, REGION_MARGIN } from "./frameExport";
import { rectangleRegionsOfOwnSets } from "./regionSelection";
import { runExport } from "./runExport";
import { useViewerStore, useViewerStoreApi } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import { useCanAnnotate } from "../../utils/useCanAnnotate";
import { geometriesBounds } from "../annotations/flyToFeature";
import { calculateViewStateToFitBounds } from "../canvas/Measurements/calculateViewStateToFitBounds";
import { millimetersPerUnit } from "../canvas/Measurements/utils";
import { Section } from "~/components/Section/Section";
import { parseResourceId } from "~/utils/resourceId";

type SourceChoice = "current-view" | "annotation-region";
type RunState =
  | { phase: "idle" }
  | { phase: "rendering"; width: number; height: number }
  | { phase: "error"; message: string };

const DEFAULT_DECORATIONS: ExportDecorations = {
  scaleBar: true,
  magnification: true,
  legend: true,
  annotationRegions: false,
  attribution: true,
};

/** Frames a region's bounds in the active panel's viewport with the shared
 *  margin — the same extent the capture renders. */
const regionViewState = (
  bounds: [number, number, number, number],
  width: number,
  height: number,
  base: Parameters<typeof calculateViewStateToFitBounds>[2],
) =>
  calculateViewStateToFitBounds(bounds, { width, height }, base, {
    padding: 0,
    fitFraction: 1 / (1 + 2 * REGION_MARGIN),
  });

/**
 * Capture and export section: configures and runs a capture of the active
 * panel's current view — source selection, region picker, resolution presets,
 * decorations, provenance annotation, summary, and the run actions. While the
 * section is active the main canvas frames the capture extent: selecting a
 * region pans and zooms the active panel to it.
 */
export const CaptureExportSection = () => {
  const { toast } = useToast();
  const storeApi = useViewerStoreApi();
  const resourceId = useViewerStore((s) => s.id);
  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const setViewStateActive = useViewerStore(select.setViewStateActive);
  const canAnnotate = useCanAnnotate();

  const [source, setSource] = useState<SourceChoice>("current-view");
  const [regionFeatureId, setRegionFeatureId] = useState<string | null>(null);
  const [presetId, setPresetId] = useState<ResolutionPreset["id"]>("presentation");
  const [decorations, setDecorations] = useState<ExportDecorations>(DEFAULT_DECORATIONS);
  const [createExportAnnotation, setCreateExportAnnotation] = useState(false);
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });

  const imageBasename = useMemo(() => {
    try {
      return parseResourceId(resourceId).name || "capture";
    } catch {
      return "capture";
    }
  }, [resourceId]);

  const rectangleRegions = useMemo(
    () => (canAnnotate ? rectangleRegionsOfOwnSets(storeApi.getState()) : []),
    [canAnnotate, storeApi],
  );

  const selectedRegion = useMemo(
    () => rectangleRegions.find((region) => region.id === regionFeatureId) ?? null,
    [rectangleRegions, regionFeatureId],
  );

  const regionBounds = useMemo(
    () =>
      source === "annotation-region" && selectedRegion?.feature.geometry
        ? geometriesBounds([selectedRegion.feature.geometry])
        : null,
    [source, selectedRegion],
  );

  const preset = RESOLUTION_PRESETS.find((item) => item.id === presetId) ?? RESOLUTION_PRESETS[1];

  // Selecting a region pans and zooms the active panel to frame exactly the
  // capture extent — the main canvas is the preview. Keyed on the bounds and
  // source only: deriving from `viewStateActive` would re-run on every pan the
  // effect itself caused. The viewport size is read per-run from the store.
  const regionBoundsKey = regionBounds?.join(",") ?? null;
  const setViewStateActiveRef = useRef(setViewStateActive);
  useEffect(() => {
    setViewStateActiveRef.current = setViewStateActive;
  }, [setViewStateActive]);
  useEffect(() => {
    if (source !== "annotation-region" || !regionBoundsKey || !viewStateActive) return;
    const bounds = regionBoundsKey.split(",").map(Number) as [number, number, number, number];
    setViewStateActiveRef.current(
      regionViewState(bounds, viewStateActive.width, viewStateActive.height, viewStateActive),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, regionBoundsKey]);

  const outputSize = useMemo(() => {
    const framed =
      regionBounds && viewStateActive
        ? frameRegion(viewStateActive, regionBounds, 1)
        : viewStateActive
          ? frameCurrentView(viewStateActive, 1)
          : null;
    if (!framed || !metadata) return null;

    const millimetersPerLevel0Px =
      (metadata.Pixels.PhysicalSizeX ?? 1) * millimetersPerUnit(metadata.Pixels.PhysicalSizeXUnit);
    const widthMm = framed.level0Width * millimetersPerLevel0Px;
    const heightMm = framed.level0Height * millimetersPerLevel0Px;
    const pxPerInch = preset.dpi;
    return {
      width: Math.max(1, Math.round((widthMm / 25.4) * pxPerInch)),
      height: Math.max(1, Math.round((heightMm / 25.4) * pxPerInch)),
      millimetersPerPixel: millimetersPerLevel0Px / (framed.level0Width / framed.level0Width),
    };
  }, [regionBounds, viewStateActive, metadata, preset]);

  const scaleBarLabel = useMemo(() => {
    if (!outputSize || !metadata) return null;
    const framed =
      regionBounds && viewStateActive
        ? frameRegion(viewStateActive, regionBounds, 1)
        : viewStateActive
          ? frameCurrentView(viewStateActive, 1)
          : null;
    if (!framed) return null;
    const millimetersPerLevel0Px =
      (metadata.Pixels.PhysicalSizeX ?? 1) * millimetersPerUnit(metadata.Pixels.PhysicalSizeXUnit);
    // One export px covers this many level-0 px at the framing's own scale.
    const level0PxPerExportPx = framed.level0Width / Math.max(outputSize.width, 1);
    return scaleBarLabelForPixelSize(millimetersPerLevel0Px * level0PxPerExportPx);
  }, [regionBounds, viewStateActive, metadata, outputSize]);

  const summaryLine = useMemo(() => {
    if (!outputSize) return null;
    const parts: string[] = [];
    if (scaleBarLabel) parts.push(`Scale bar: ${scaleBarLabel}`);
    parts.push(`Output: ${outputSize.width} × ${outputSize.height} px`);
    parts.push("PNG");
    return parts.join(" · ");
  }, [scaleBarLabel, outputSize]);

  const decorationRows: { id: keyof ExportDecorations; label: string }[] = [
    { id: "scaleBar", label: "Scale bar" },
    { id: "magnification", label: "Magnification" },
    { id: "legend", label: "Channel and overlay legend" },
    { id: "annotationRegions", label: "Annotation regions" },
    { id: "attribution", label: "Cytario attribution" },
  ];

  const isRendering = runState.phase === "rendering";

  const runCapture = useCallback(
    async (destination: "download" | "clipboard") => {
      setRunState({
        phase: "rendering",
        width: outputSize?.width ?? 0,
        height: outputSize?.height ?? 0,
      });
      try {
        const result = await runExport({
          store: storeApi,
          preset,
          decorations,
          imageBasename,
          regionFeatureId: source === "annotation-region" ? regionFeatureId : null,
        });

        if (destination === "clipboard") {
          try {
            await copyExportToClipboard(result.blob);
          } catch {
            downloadExport(result.blob, result.filename);
            toast({ variant: "info", message: "Clipboard unavailable — downloaded instead." });
            return;
          }
        } else {
          downloadExport(result.blob, result.filename);
        }

        // The provenance region records the exported extent on the current-view
        // path only — a region export's own annotation already records it.
        if (createExportAnnotation && canAnnotate && source === "current-view" && viewStateActive) {
          const framed = frameCurrentView(viewStateActive, 1);
          const halfWidth = framed.level0Width / 2;
          const halfHeight = framed.level0Height / 2;
          const [targetX, targetY] = framed.viewState.target;
          commitExportAnnotation(storeApi, null, {
            bounds: [
              targetX - halfWidth,
              targetY - halfHeight,
              targetX + halfWidth,
              targetY + halfHeight,
            ],
            filename: result.filename,
          });
        }

        const notes: string[] = [];
        if (result.clamped) {
          notes.push(
            `exported at ${result.width} × ${result.height} px (clipped from ${outputSize?.width} × ${outputSize?.height} px)`,
          );
        }
        if (result.upscaled) {
          notes.push("upscaled beyond native scan resolution");
        }
        toast({
          variant: "success",
          message: [`Captured ${result.filename}`, ...notes].join(" — "),
        });
      } catch (error) {
        setRunState({
          phase: "error",
          message: error instanceof Error ? error.message : "The capture could not be rendered.",
        });
      }
    },
    [
      storeApi,
      source,
      regionFeatureId,
      preset,
      decorations,
      imageBasename,
      toast,
      createExportAnnotation,
      canAnnotate,
      viewStateActive,
      outputSize,
    ],
  );

  return (
    <Section id="capture" title="Capture and export" icon={CameraIcon}>
      <div className="flex flex-col gap-3 p-2 pb-3">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Source</span>
          <SegmentedControl
            aria-label="Capture source"
            selectionMode="single"
            size="sm"
            selectedKeys={new Set([source])}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next === "annotation-region" || next === "current-view") setSource(next);
            }}
          >
            <SegmentedControlItem id="current-view" className="flex items-center gap-1.5 px-2">
              <Icon icon="Image" size="sm" />
              Current view
            </SegmentedControlItem>
            <SegmentedControlItem
              id="annotation-region"
              className="flex items-center gap-1.5 px-2"
              isDisabled={!canAnnotate || rectangleRegions.length === 0}
            >
              <Icon icon="Square" size="sm" />
              Annotation region
            </SegmentedControlItem>
          </SegmentedControl>

          {source === "annotation-region" && rectangleRegions.length > 0 && (
            <select
              className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
              value={regionFeatureId ?? ""}
              onChange={(event) => {
                if (event.target.value) setRegionFeatureId(event.target.value);
              }}
              aria-label="Region"
            >
              {!regionFeatureId && (
                <option value="" disabled>
                  Select a rectangle region
                </option>
              )}
              {rectangleRegions.map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-foreground">Resolution</span>
          <select
            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
            value={presetId}
            onChange={(event) => setPresetId(event.target.value as ResolutionPreset["id"])}
            aria-label="Resolution"
          >
            {RESOLUTION_PRESETS.map((presetOption) => (
              <option key={presetOption.id} value={presetOption.id}>
                {presetOption.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          {decorationRows.map((row) => (
            <Checkbox
              key={row.id}
              isSelected={decorations[row.id]}
              onChange={(isSelected) =>
                setDecorations((current) => ({ ...current, [row.id]: isSelected }))
              }
            >
              {row.label}
            </Checkbox>
          ))}
          {source === "current-view" && canAnnotate && (
            <Checkbox isSelected={createExportAnnotation} onChange={setCreateExportAnnotation}>
              Create export annotation
            </Checkbox>
          )}
        </div>

        {summaryLine && <p className="text-xs text-muted-foreground">{summaryLine}</p>}

        {runState.phase === "error" && (
          <div
            className="flex flex-col gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
            data-testid="export-error"
          >
            <span>{runState.message}</span>
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onPress={() => {
                setRunState({ phase: "idle" });
                void runCapture("download");
              }}
            >
              Retry
            </Button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border pt-2">
          {isRendering && (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner size="sm" aria-label="Rendering" />
              Rendering {runState.width} × {runState.height} px…
            </span>
          )}
          <Button
            variant="outline"
            isDisabled={isRendering}
            onPress={() => void runCapture("clipboard")}
          >
            Copy
          </Button>
          <Button
            variant="primary"
            isDisabled={isRendering}
            onPress={() => void runCapture("download")}
          >
            Download
          </Button>
        </div>
      </div>
    </Section>
  );
};
