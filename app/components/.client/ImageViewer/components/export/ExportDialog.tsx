import {
  Button,
  Checkbox,
  Dialog,
  Icon,
  Select,
  SegmentedControl,
  SegmentedControlItem,
  Spinner,
  useToast,
  type SelectItem,
} from "@cytario/design";
import { useCallback, useMemo, useState } from "react";

import { commitExportAnnotation } from "./commitExportAnnotation";
import { FramedViewPreview } from "./FramedViewPreview";
import { geometriesBounds } from "../../components/annotations/flyToFeature";
import { scaleBarLabelForZoom } from "../../export/decorations";
import {
  copyExportToClipboard,
  downloadExport,
  exportView,
  rectangleRegionsOfOwnSets,
  type ExportDecorations,
  type ExportDestination,
  type ExportViewOptions,
} from "../../export/exportView";
import { useViewerStore, useViewerStoreApi } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import { useCanAnnotate } from "../../utils/useCanAnnotate";
import { parseResourceId } from "~/utils/resourceId";

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type SourceChoice = "current-view" | "annotation-region";
type RunState =
  | { phase: "idle" }
  | { phase: "rendering"; width: number; height: number }
  | { phase: "error"; message: string };

const RESOLUTION_OPTIONS = [1, 2, 4] as const;
const ASPECT_OPTIONS: { id: ExportViewOptions["aspect"]; name: string }[] = [
  { id: "as-viewed", name: "As viewed" },
  { id: "16:9", name: "16:9" },
  { id: "4:3", name: "4:3" },
];

const DEFAULT_DECORATIONS: ExportDecorations = {
  scaleBar: true,
  magnification: true,
  channelLabels: true,
  annotationRegions: false,
  caption: false,
};

/**
 * Export dialog: configures and runs a capture of the active panel's current
 * view — source selection, region picker, resolution, aspect, framed-view
 * preview, decorations, provenance annotation, and the run actions.
 */
export const ExportDialog = ({ isOpen, onClose }: ExportDialogProps) => {
  const { toast } = useToast();
  const storeApi = useViewerStoreApi();
  const resourceId = useViewerStore((s) => s.id);
  const metadata = useViewerStore(select.metadata);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const visibleChannelCount = useViewerStore(select.visibleChannelCount);
  const canAnnotate = useCanAnnotate();

  const [source, setSource] = useState<SourceChoice>("current-view");
  const [regionFeatureId, setRegionFeatureId] = useState<string | null>(null);
  const [scale, setScale] = useState(2);
  const [aspect, setAspect] = useState<ExportViewOptions["aspect"]>("as-viewed");
  const [decorations, setDecorations] = useState<ExportDecorations>(() => ({
    ...DEFAULT_DECORATIONS,
    // Channel labels default on only when more than one channel is visible.
    channelLabels: visibleChannelCount > 1,
  }));
  const [createExportAnnotation, setCreateExportAnnotation] = useState(true);
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

  const regionItems: SelectItem[] = useMemo(
    () => rectangleRegions.map((region) => ({ id: region.id, name: region.name })),
    [rectangleRegions],
  );

  const outputSize = useMemo(() => {
    const width = viewStateActive?.width ?? 0;
    const height = viewStateActive?.height ?? 0;
    let effectiveScale = scale;
    if (aspect !== "as-viewed" && width > 0 && height > 0) {
      const targetRatio = aspect === "16:9" ? 16 / 9 : 4 / 3;
      const currentRatio = width / height;
      // A non-matching aspect crops the longer axis, so the shorter axis
      // carries the full resolution.
      effectiveScale = currentRatio > targetRatio ? scale * (targetRatio / currentRatio) : scale;
    }
    return {
      width: Math.round(width * effectiveScale),
      height: Math.round(height * effectiveScale),
    };
  }, [viewStateActive, scale, aspect]);

  const scaleBarLabel = useMemo(
    () =>
      scaleBarLabelForZoom({
        physicalSizeX: metadata?.Pixels.PhysicalSizeX ?? null,
        unit: metadata?.Pixels.PhysicalSizeXUnit ?? "µm",
        zoom: viewStateActive?.zoom ?? 0,
        scale,
      }),
    [metadata, viewStateActive, scale],
  );

  const summaryLine = useMemo(() => {
    const parts: string[] = [];
    if (scaleBarLabel) parts.push(`Scale bar: ${scaleBarLabel}`);
    parts.push(`Output: ${outputSize.width} × ${outputSize.height} px`);
    parts.push("PNG");
    return parts.join(" · ");
  }, [scaleBarLabel, outputSize]);

  const decorationRows: { id: keyof ExportDecorations; label: string }[] = [
    { id: "scaleBar", label: "Scale bar" },
    { id: "magnification", label: "Magnification" },
    { id: "channelLabels", label: "Channel labels" },
    { id: "annotationRegions", label: "Annotation regions" },
    { id: "caption", label: "Caption" },
  ];

  const isRendering = runState.phase === "rendering";

  const runExport = useCallback(
    async (destination: ExportDestination) => {
      const exportSource =
        source === "annotation-region" && selectedRegion
          ? ({ kind: "annotation-region", feature: selectedRegion.feature } as const)
          : ({ kind: "current-view" } as const);

      setRunState({ phase: "rendering", width: outputSize.width, height: outputSize.height });
      try {
        const result = await exportView({
          store: storeApi,
          options: {
            source: exportSource,
            scale,
            aspect,
            decorations,
            imageBasename,
          },
          showToast: toast,
        });

        if (destination === "clipboard") {
          try {
            await copyExportToClipboard(result.blob);
          } catch {
            downloadExport(result.blob, result.filename);
            toast({ variant: "info", message: "Clipboard unavailable — downloaded instead." });
            onClose();
            return;
          }
        } else {
          downloadExport(result.blob, result.filename);
        }

        if (
          createExportAnnotation &&
          canAnnotate &&
          exportSource.kind === "annotation-region" &&
          selectedRegion
        ) {
          commitExportAnnotation(storeApi, selectedRegion.setId, result, selectedRegion.feature);
        }

        // The completion state reports the applied clamp and upscale flags
        // alongside the filename (SRS-CY-33407/33408).
        const notes: string[] = [];
        if (result.clamped) {
          notes.push(
            `exported at ${result.width} × ${result.height} px (clipped from ${outputSize.width} × ${outputSize.height})`,
          );
        }
        if (result.upscaled) {
          notes.push("upscaled beyond native scan resolution");
        }
        toast({
          variant: "success",
          message: [`Captured ${result.filename}`, ...notes].join(" — "),
        });
        onClose();
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
      selectedRegion,
      outputSize,
      scale,
      aspect,
      decorations,
      imageBasename,
      toast,
      createExportAnnotation,
      canAnnotate,
      onClose,
    ],
  );

  if (!isOpen) return null;

  const errorMessage = runState.phase === "error" ? runState.message : null;

  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open && !isRendering) onClose();
      }}
      title="Export"
      isDismissable={!isRendering}
      size="xl"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">Source</span>
          <SegmentedControl
            aria-label="Export source"
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

          {source === "annotation-region" && regionItems.length > 0 && (
            <Select
              label="Annotation region"
              items={regionItems}
              placeholder="Select a rectangle region"
              selectedKey={regionFeatureId ?? undefined}
              onSelectionChange={(key) => {
                if (typeof key === "string") setRegionFeatureId(key);
              }}
            />
          )}
        </div>

        <div className="flex flex-col gap-4 lg:flex-row">
          <div className="flex flex-1 flex-col gap-4">
            <Select
              aria-label="Resolution"
              label="Resolution"
              items={RESOLUTION_OPTIONS.map((value) => ({ id: String(value), name: `${value}×` }))}
              selectedKey={String(scale)}
              onSelectionChange={(key) => {
                if (typeof key === "string") setScale(Number(key));
              }}
            />
            <Select
              aria-label="Aspect"
              label="Aspect"
              items={ASPECT_OPTIONS}
              selectedKey={aspect}
              onSelectionChange={(key) => {
                const next = ASPECT_OPTIONS.find((option) => option.id === key);
                if (next) setAspect(next.id);
              }}
            />

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
              {source === "annotation-region" && canAnnotate && (
                <Checkbox isSelected={createExportAnnotation} onChange={setCreateExportAnnotation}>
                  Create export annotation
                </Checkbox>
              )}
            </div>

            <p className="text-xs text-muted-foreground" data-testid="export-summary-line">
              {summaryLine}
            </p>

            {errorMessage && (
              <div
                className="flex flex-col gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive"
                data-testid="export-error"
              >
                <span>{errorMessage}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onPress={() => {
                    setRunState({ phase: "idle" });
                    void runExport("download");
                  }}
                >
                  Retry
                </Button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 items-start justify-center">
            <FramedViewPreview
              aspect={aspect}
              regionBounds={
                source === "annotation-region" && selectedRegion
                  ? geometriesBounds([selectedRegion.feature.geometry])
                  : null
              }
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="ghost" onPress={onClose}>
            {isRendering ? "Cancel render" : "Cancel"}
          </Button>

          <div className="flex items-center gap-2">
            {isRendering && (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner size="sm" aria-label="Rendering" />
                Rendering {runState.width} × {runState.height} px…
              </span>
            )}
            <Button
              variant="outline"
              isDisabled={isRendering}
              onPress={() => void runExport("clipboard")}
            >
              Copy to clipboard
            </Button>
            <Button
              variant="primary"
              isDisabled={isRendering}
              onPress={() => void runExport("download")}
            >
              Download
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
};
