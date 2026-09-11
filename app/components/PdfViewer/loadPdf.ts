// Bundled same-origin worker (DuckDB `?url` asset pattern) — pdf.js never
// auto-sets workerSrc in the browser and CSP worker-src 'self' forbids CDNs.
import * as pdfjsDist from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

const { getDocument } = pdfjsDist;

export interface RenderOptions {
  /** Explicit zoom scale (1 = 100%); when omitted, `fitWidth` drives the scale. */
  scale?: number;
  /** Container width in CSS px the page should fit; ignored when `scale` is set. */
  fitWidth?: number;
}

let workerConfigured = false;

/** Point pdf.js at the bundled worker (idempotent; no-op under test mocks). */
function configureWorker(): void {
  if (workerConfigured) return;
  pdfjsDist.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

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
  configureWorker();
  const data = await response.arrayBuffer();
  return getDocument({ data }).promise;
}

/** Render one page of the document onto a canvas. */
export async function renderPdfPage(
  doc: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  options: RenderOptions = {},
): Promise<void> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = options.scale ?? (options.fitWidth ? options.fitWidth / base.width : 1);
  const viewport = page.getViewport({ scale });

  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable");
  }
  await page.render({ canvas, canvasContext: context, viewport }).promise;
}
