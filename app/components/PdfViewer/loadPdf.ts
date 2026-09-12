import * as pdfjsDist from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

const { getDocument } = pdfjsDist;

/** Same preview ceiling as the context-menu Download action. */
export const MAX_PDF_BYTES = 256 * 1024 * 1024;

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

export interface RenderOptions {
  /** Explicit zoom scale (1 = 100%); when omitted, `fitWidth` drives the scale. */
  scale?: number;
  /** Container width in CSS px the page should fit; ignored when `scale` is set. */
  fitWidth?: number;
}

export interface RenderHandle {
  done: Promise<void>;
  cancel: () => void;
}

let workerConfigured = false;

/** pdf.js requires workerSrc before the first getDocument call. */
function configureWorker(): void {
  if (workerConfigured) return;
  pdfjsDist.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

const SIZE_LIMIT_MESSAGE = `PDF exceeds the ${MAX_PDF_BYTES / (1024 * 1024)} MB preview limit`;

/** Fetch the PDF bytes via a signed GET and open the pdf.js document. */
export async function loadPdfDocument(
  resourceId: string,
  signedFetch: SignedFetch,
): Promise<PDFDocumentProxy> {
  const { httpsUrl } = resolveResourceId(resourceId);
  const response = await signedFetch(httpsUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} loading PDF`);
  }
  // Chunked responses may omit content-length — the byte count is checked again
  // after the read.
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PDF_BYTES) {
    throw new Error(SIZE_LIMIT_MESSAGE);
  }
  configureWorker();
  const data = await response.arrayBuffer();
  if (data.byteLength > MAX_PDF_BYTES) {
    throw new Error(SIZE_LIMIT_MESSAGE);
  }
  return getDocument({ data }).promise;
}

/** Render one page onto a canvas; the backing store is scaled by the device pixel ratio. */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: RenderOptions = {},
): Promise<RenderHandle> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const dpr = window.devicePixelRatio || 1;
  const fitScale = options.fitWidth ? options.fitWidth / base.width : 1;
  const cssScale = options.scale ?? Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, fitScale));
  const viewport = page.getViewport({ scale: cssScale * dpr });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(base.width * cssScale)}px`;
  canvas.style.height = `${Math.floor(base.height * cssScale)}px`;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable");
  }
  const task = page.render({ canvas, canvasContext: context, viewport });
  return { done: task.promise, cancel: () => task.cancel() };
}
