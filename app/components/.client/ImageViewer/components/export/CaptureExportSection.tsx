import {
  Button,
  Checkbox,
  Icon,
  SegmentedControl,
  SegmentedControlItem,
  Select,
  Tooltip,
  useToast,
} from "@cytario/design";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CaptureDeck } from "./CaptureDeck";
import { captureBounds, frameCapture } from "./captureFrame";
import { fallbackRenderLimits } from "./clamp";
import { commitExportAnnotation } from "./commitExportAnnotation";
import {
  composeCapture,
  RESOLUTION_PRESETS,
  type ExportDecorations,
  type ResolutionPreset,
} from "./composeCapture";
import { copyExportToClipboard, downloadExport } from "./composeCapture";
import { planExport, legendForState, RENDER_TIMEOUT_MS, type CapturePlan } from "./planExport";
import { rectangleRegions } from "./regionSelection";
import { useViewerStore, useViewerStoreApi } from "../../state/store/core/ViewerStoreContext";
import { select } from "../../state/store/selectors";
import { getMissingChunks, resetMissingChunks } from "../../state/transport/CredentialedHTTPStore";
import { useCanAnnotate } from "../../utils/useCanAnnotate";
import { geometriesBounds } from "../annotations/flyToFeature";
import { calculateViewStateToFitBounds } from "../canvas/Measurements/calculateViewStateToFitBounds";
import { physicalPixelSize } from "../canvas/Measurements/utils";
import { Section } from "~/components/Section/Section";
import { parseResourceId } from "~/utils/resourceId";

type SourceChoice = "current-view" | "annotation-region";
type RunState =
  | { phase: "idle" }
  | { phase: "rendering"; destination: "download" | "clipboard" }
  | { phase: "error"; message: string };

/** An in-flight capture: the resolved plan plus everything the compose and
 * delivery steps need. The deck that renders `plan` is mounted by the section
 * — inside the app tree, where the viewer store context exists. */
interface ActiveRun {
  plan: CapturePlan;
  destination: "download" | "clipboard";
  preset: ResolutionPreset;
  decorations: ExportDecorations;
  imageBasename: string;
  regionFeatureId: string | null;
}

const DEFAULT_DECORATIONS: ExportDecorations = {
  scaleBar: true,
  legend: true,
};

/** Margin around a region shown on the live panel, as a fraction of each axis. */
const REGION_MARGIN = 0.02;

/** Fits a region's bounds with the margin inside the active panel's viewport,
 *  for showing it on screen. The capture exports exactly the region
 *  (`captureBounds`), not this viewport-shaped fit. */
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
 * section is active the main canvas previews the source: selecting a
 * region pans and zooms the active panel to it.
 */
export const CaptureExportSection = () => {
  const { toast } = useToast();
  const storeApi = useViewerStoreApi();
  const resourceId = useViewerStore((s) => s.id);
  const viewStateActive = useViewerStore(select.viewStateActive);
  const metadata = useViewerStore(select.metadata);
  const setViewStateActive = useViewerStore(select.setViewStateActive);
  const canAnnotate = useCanAnnotate();

  const [source, setSource] = useState<SourceChoice>("current-view");
  const [presetId, setPresetId] = useState<ResolutionPreset["id"]>("presentation");
  const [decorations, setDecorations] = useState<ExportDecorations>(DEFAULT_DECORATIONS);
  const [createExportAnnotation, setCreateExportAnnotation] = useState(false);
  const [runState, setRunState] = useState<RunState>({ phase: "idle" });
  const [activeRun, setActiveRun] = useState<ActiveRun | null>(null);

  const imageBasename = useMemo(() => {
    try {
      return parseResourceId(resourceId).name || "capture";
    } catch {
      return "capture";
    }
  }, [resourceId]);

  const annotationSets = useViewerStore((s) => s.annotationSets);
  // Annotation sets load into the store asynchronously, so the region list
  // follows the subscribed array — not a mount-time store snapshot.
  const availableRegions = useMemo(() => rectangleRegions(annotationSets), [annotationSets]);

  // The region picker is the canvas selection, both ways: picking a region
  // selects its annotation, and a single selected rectangle region drives the
  // picker. Anything else selected (nothing, several, points) leaves the
  // source as-is.
  const annotationSelectedIds = useViewerStore((s) => s.annotationSelectedIds);
  const setAnnotationSelectedIds = useViewerStore((s) => s.setAnnotationSelectedIds);
  const selectedRegion = useMemo(
    () =>
      annotationSelectedIds.length === 1
        ? (availableRegions.find((region) => region.id === annotationSelectedIds[0]) ?? null)
        : null,
    [availableRegions, annotationSelectedIds],
  );

  // Selection changes move the source with them: a selected rectangle region
  // makes the capture a region capture, losing it returns to the current view.
  const prevSelectedRegionIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = selectedRegion?.id ?? null;
    const prevId = prevSelectedRegionIdRef.current;
    prevSelectedRegionIdRef.current = id;
    if (prevId === id) return;
    setSource(id ? "annotation-region" : "current-view");
  }, [selectedRegion]);

  const regionBounds = useMemo(
    () =>
      source === "annotation-region" && selectedRegion?.feature.geometry
        ? geometriesBounds([selectedRegion.feature.geometry])
        : null,
    [source, selectedRegion],
  );

  const preset = RESOLUTION_PRESETS.find((item) => item.id === presetId) ?? RESOLUTION_PRESETS[1];

  // Selecting a region pans and zooms the active panel to show it — the main
  // canvas is the preview. Keyed on the bounds and
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

  // The same derivation the run's plan uses, so the summary names exactly
  // what the capture will export.
  const frame = useMemo(
    () =>
      viewStateActive?.width && viewStateActive.height
        ? frameCapture(
            captureBounds(viewStateActive, regionBounds),
            preset.targetWidthPx,
            fallbackRenderLimits(),
          )
        : null,
    [viewStateActive, regionBounds, preset],
  );

  const summaryLine = frame ? `Output: ${frame.width} × ${frame.height} px · PNG` : null;

  const hasPhysicalScale = metadata ? physicalPixelSize(metadata.Pixels) !== null : false;
  const decorationRows: {
    id: keyof ExportDecorations;
    label: string;
    /** Why the decoration cannot be drawn for this image, if it cannot. */
    disabledReason?: string;
  }[] = [
    {
      id: "scaleBar",
      label: "Scale bar",
      disabledReason: hasPhysicalScale
        ? undefined
        : "This image has no physical pixel size, so a scale bar cannot be measured.",
    },
    { id: "legend", label: "Channel and overlay legend" },
  ];

  const renderingTo = runState.phase === "rendering" ? runState.destination : null;
  const isRendering = renderingTo !== null;

  const fail = useCallback((message: string) => {
    setActiveRun(null);
    setRunState({
      phase: "error",
      message,
    });
  }, []);

  // A run that never settles must fail on a clock, not hang — the deck can
  // stall on tiles that never arrive.
  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setTimeout(() => {
      fail("The capture timed out waiting for the image tiles to finish loading.");
    }, RENDER_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [activeRun, fail]);

  // The settle path: the in-tree capture deck reports every layer loaded and
  // hands over its canvas — compose the export from it and deliver.
  const deliver = useCallback(
    (run: ActiveRun) =>
      async (canvas: HTMLCanvasElement): Promise<void> => {
        // The legend must reflect the store the pixels rendered from —
        // resolve it at settle time, not from the plan-time snapshot.
        const legend = legendForState(storeApi);
        let result;
        try {
          result = await composeCapture(canvas, {
            preset: run.preset,
            imageBasename: run.imageBasename,
            decorations: run.decorations,
            frame: run.plan.frame,
            metadata: run.plan.metadata,
            legend,
          });
        } catch (error) {
          fail(error instanceof Error ? error.message : "The capture could not be rendered.");
          return;
        }

        // A provably empty render is not a deliverable export: the detector
        // exists to stop exactly this, so fail rather than hand over a flat
        // image with a note attached.
        if (result.uniform) {
          fail(
            "The capture rendered a single flat colour — no image content reached the export. Try capturing again.",
          );
          return;
        }

        // A chunk the pyramid index promised but the store does not hold is
        // filled with zeros and renders as black tissue with no error. Better
        // to say the pyramid is incomplete than to ship an empty region.
        const missing = getMissingChunks();
        if (missing.length > 0) {
          fail(
            `The image's pyramid is incomplete — ${missing.length} data chunk(s) of the selected area are missing, so it cannot be exported faithfully.`,
          );
          return;
        }

        if (run.destination === "clipboard") {
          try {
            await copyExportToClipboard(result.blob);
          } catch {
            downloadExport(result.blob, result.filename);
            toast({ variant: "info", message: "Clipboard unavailable — downloaded instead." });
          }
        } else {
          downloadExport(result.blob, result.filename);
        }

        // The provenance region records the exported extent on the current-view
        // path only — a region export's own annotation already records it.
        if (createExportAnnotation && canAnnotate && run.regionFeatureId === null) {
          try {
            commitExportAnnotation(storeApi, {
              bounds: run.plan.frame.bounds,
              name: result.timestamp,
            });
          } catch (error) {
            toast({
              variant: "error",
              message: `Exported, but the export annotation was not created: ${
                error instanceof Error ? error.message : "unknown error"
              }`,
            });
          }
        }

        const notes: string[] = [];
        if (result.clamped) {
          notes.push(
            `exported at ${result.width} × ${result.height} px (clipped from the requested size)`,
          );
        }
        if (result.upscaled) {
          notes.push("upscaled beyond native scan resolution");
        }
        // An empty legend is invisible in the output — say so instead of
        // shipping it silently.
        if (
          run.decorations.legend &&
          legend.channels.length === 0 &&
          legend.overlays.length === 0
        ) {
          notes.push("legend: no visible channels");
        }
        toast({
          variant: "success",
          message: [`Captured ${result.filename}`, ...notes].join(" — "),
        });
        setActiveRun(null);
        setRunState({ phase: "idle" });
      },
    [fail, toast, storeApi, createExportAnnotation, canAnnotate],
  );

  const runCapture = useCallback(
    (destination: "download" | "clipboard") => {
      try {
        // Count missing chunks from this run only — the live panel's fetches
        // must not condemn a capture.
        resetMissingChunks();
        const plan = planExport({
          store: storeApi,
          preset,
          regionFeatureId: source === "annotation-region" ? (selectedRegion?.id ?? null) : null,
        });
        setActiveRun({
          plan,
          destination,
          preset,
          decorations,
          imageBasename,
          regionFeatureId: source === "annotation-region" ? (selectedRegion?.id ?? null) : null,
        });
        setRunState({
          phase: "rendering",
          destination,
        });
      } catch (error) {
        setRunState({
          phase: "error",
          message: error instanceof Error ? error.message : "The capture could not be rendered.",
        });
      }
    },
    [storeApi, source, selectedRegion, preset, decorations, imageBasename],
  );

  return (
    <Section id="capture" title="Capture and export" icon="Camera">
      {/* The capture run's deck mounts HERE — inside the app tree, within the
       * ViewerStoreProvider the shared layer hooks require. Hidden from
       * interaction; torn down with the run (or the section) by React. */}
      {activeRun && (
        <CaptureDeck
          // Remount per framed view state: the deck derives all of its settle
          // state (viewport, tile readiness) from the frame it mounts for.
          key={`${activeRun.plan.viewState.target.join(",")}@${activeRun.plan.viewState.zoom}`}
          viewState={activeRun.plan.viewState}
          width={activeRun.plan.frame.width}
          height={activeRun.plan.frame.height}
          pixelScale={activeRun.plan.pixelScale}
          excludeAnnotationId={activeRun.regionFeatureId}
          hidden
          onSettled={(canvas) => {
            void deliver(activeRun)(canvas);
          }}
          onFailed={fail}
        />
      )}
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
              if (next !== "current-view" && next !== "annotation-region") return;
              // Choosing the current view deselects — the picker IS the selection.
              if (next === "current-view") setAnnotationSelectedIds([]);
              setSource(next);
            }}
          >
            <SegmentedControlItem id="current-view" className="flex items-center gap-1.5 px-2">
              <Icon icon="Image" size="sm" />
              Current view
            </SegmentedControlItem>
            <SegmentedControlItem
              id="annotation-region"
              className="flex items-center gap-1.5 px-2"
              isDisabled={availableRegions.length === 0}
            >
              <Icon icon="Square" size="sm" />
              Annotation region
            </SegmentedControlItem>
          </SegmentedControl>

          {source === "annotation-region" && availableRegions.length > 0 && (
            <Select
              label="Region"
              placeholder="Select a rectangle region"
              size="sm"
              items={availableRegions.map((region) => ({ id: region.id, name: region.name }))}
              selectedKey={selectedRegion?.id ?? null}
              onSelectionChange={(key) => {
                if (typeof key === "string") setAnnotationSelectedIds([key]);
              }}
            />
          )}
        </div>

        <Select
          label="Resolution"
          size="sm"
          items={RESOLUTION_PRESETS.map((presetOption) => ({
            id: presetOption.id,
            name: `${presetOption.name} — ${presetOption.targetWidthPx} px`,
          }))}
          selectedKey={presetId}
          onSelectionChange={(key) => {
            if (typeof key === "string") setPresetId(key as ResolutionPreset["id"]);
          }}
        />

        <div className="flex flex-col gap-1.5">
          {decorationRows.map((row) => (
            <Tooltip key={row.id} content={row.disabledReason}>
              <Checkbox
                isSelected={decorations[row.id] && !row.disabledReason}
                isDisabled={Boolean(row.disabledReason)}
                onChange={(isSelected) =>
                  setDecorations((current) => ({ ...current, [row.id]: isSelected }))
                }
              >
                {row.label}
              </Checkbox>
            </Tooltip>
          ))}
          {source === "current-view" && canAnnotate && (
            <Tooltip content="Adds a rectangle marking the exported area to your active annotation set, in the Captures class, named with the capture time from the exported file's name.">
              <Checkbox isSelected={createExportAnnotation} onChange={setCreateExportAnnotation}>
                Create export annotation
              </Checkbox>
            </Tooltip>
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
          <Button
            variant="outline"
            isLoading={renderingTo === "clipboard"}
            isDisabled={isRendering}
            onPress={() => runCapture("clipboard")}
          >
            Copy
          </Button>
          <Button
            variant="primary"
            isLoading={renderingTo === "download"}
            isDisabled={isRendering}
            onPress={() => runCapture("download")}
          >
            Download
          </Button>
        </div>
      </div>
    </Section>
  );
};
