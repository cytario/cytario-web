import { Button } from "@cytario/design";
import { type PDFDocumentProxy } from "pdfjs-dist";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadPdfDocument, MAX_ZOOM, MIN_ZOOM, renderPdfPage, type RenderHandle } from "./loadPdf";
import { LoaderView } from "../Loader/LoaderView";
import type { SignedFetch } from "~/utils/signedFetch";

const ZOOM_STEP = 0.25;
const FIT_WIDTH_PAGE_MARGIN = 48;
const MIN_FIT_WIDTH_PX = 150;

interface PdfViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

export const PdfViewer = ({ resourceId, signedFetch }: PdfViewerProps) => {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null); // null = fit width
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Alive references so cleanup can tear down whatever resolved last, even
  // after the effect's closure went stale.
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const renderRef = useRef<RenderHandle | null>(null);

  const handleRetry = useCallback(() => {
    setDoc(null);
    setError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    docRef.current = null;
    loadPdfDocument(resourceId, signedFetch)
      .then((document) => {
        docRef.current = document;
        if (!cancelled) setDoc(document);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      docRef.current?.loadingTask.destroy().catch(console.error);
      docRef.current = null;
    };
  }, [resourceId, signedFetch, reloadKey]);

  // Render the current page onto the canvas; re-renders on page/zoom change.
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = async () => {
      setRendering(true);
      try {
        const container = containerRef.current;
        const fitWidth = container
          ? Math.max(container.clientWidth - FIT_WIDTH_PAGE_MARGIN, MIN_FIT_WIDTH_PX)
          : undefined;
        const handle = await renderPdfPage(doc, pageNumber, canvas, {
          scale: zoom ?? undefined,
          fitWidth,
        });
        renderRef.current = handle;
        await handle.done;
      } catch (err) {
        // Cancellation surfaces as a pdf.js error name, not a failure.
        const name = (err as { name?: string }).name;
        if (cancelled || name === "RenderingCancelledException") return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setRendering(false);
      }
    };

    void render();
    return () => {
      cancelled = true;
      renderRef.current?.cancel();
      renderRef.current = null;
    };
  }, [doc, pageNumber, zoom]);

  const totalPages = doc?.numPages ?? 0;
  const hasPrev = pageNumber > 1;
  const hasNext = pageNumber < totalPages;

  if (loading) {
    return <LoaderView label="Loading document…" />;
  }

  if (error && !doc) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <p className="text-sm text-destructive">{error}</p>
        <Button onPress={handleRetry}>Retry</Button>
      </div>
    );
  }

  if (!doc) return null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            isDisabled={!hasPrev}
            onPress={() => setPageNumber((n) => Math.max(1, n - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
            Page {pageNumber} of {totalPages}
          </span>
          <Button
            variant="secondary"
            isDisabled={!hasNext}
            onPress={() => setPageNumber((n) => Math.min(totalPages, n + 1))}
          >
            Next
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            isDisabled={zoom !== null && zoom <= MIN_ZOOM}
            onPress={() => setZoom((z) => Math.max(MIN_ZOOM, (z ?? 1) - ZOOM_STEP))}
          >
            Zoom out
          </Button>
          <span className="text-sm text-muted-foreground tabular-nums">
            {zoom !== null ? `${Math.round(zoom * 100)}%` : "Fit width"}
          </span>
          <Button
            variant="secondary"
            isDisabled={zoom !== null && zoom >= MAX_ZOOM}
            onPress={() => setZoom((z) => Math.min(MAX_ZOOM, (z ?? 1) + ZOOM_STEP))}
          >
            Zoom in
          </Button>
        </div>
      </header>
      {error && <p className="px-4 py-2 text-sm text-destructive">{error}</p>}
      <div ref={containerRef} className="flex-1 overflow-auto bg-muted p-6">
        <canvas
          ref={canvasRef}
          role="img"
          className="mx-auto bg-white shadow-md"
          aria-label={`PDF page ${pageNumber} of ${totalPages}`}
        />
      </div>
      {rendering && (
        <div className="border-t p-2 text-center text-sm text-muted-foreground">Rendering…</div>
      )}
    </div>
  );
};
