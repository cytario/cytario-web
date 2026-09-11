import { getDocument } from "pdfjs-dist";
import { describe, expect, test, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { loadPdfDocument, renderPdfPage } from "../loadPdf";
import type { SignedFetch } from "~/utils/signedFetch";

const httpsUrl = "https://bucket.s3.eu-central-1.amazonaws.com/docs/report.pdf";

vi.mock("~/utils/connectionsStore/selectors", () => ({
  resolveResourceId: () => ({
    connectionId: "c1",
    pathName: "docs/report.pdf",
    credentials: {},
    region: "eu-central-1",
    endpoint: null,
    s3Uri: "s3://bucket/docs/report.pdf",
    httpsUrl,
  }),
}));

describe("loadPdfDocument", () => {
  test("signs a GET against the object httpsUrl and opens the bytes with pdf.js", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]).buffer; // "%PDF-"
    const signedFetch: SignedFetch = (async () =>
      new Response(bytes, { status: 200 })) as SignedFetch;
    const getDocumentSpy = vi.mocked(getDocument);
    getDocumentSpy.mockReturnValueOnce({
      promise: Promise.resolve({} as never),
    } as unknown as ReturnType<typeof getDocument>);

    await loadPdfDocument("c1/docs/report.pdf", signedFetch);

    expect(getDocumentSpy).toHaveBeenCalledWith({ data: bytes });
  });

  test("throws an HTTP error when the signed fetch is not ok", async () => {
    const failingFetch: SignedFetch = (async () =>
      new Response("denied", { status: 403 })) as SignedFetch;

    await expect(loadPdfDocument("c1/docs/report.pdf", failingFetch)).rejects.toThrow(
      "HTTP 403 loading PDF",
    );
  });
});

describe("renderPdfPage", () => {
  test("scales the viewport to fit the width when no scale is given", async () => {
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      })),
      render: () => ({ promise: Promise.resolve() }),
    };
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement;

    await renderPdfPage(doc as never, 1, canvas, { fitWidth: 300 });

    // Base page is 600 CSS px wide; fitting into 300 px must halve the scale.
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 0.5 });
    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
  });

  test("uses the explicit scale when provided", async () => {
    const page = {
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      })),
      render: () => ({ promise: Promise.resolve() }),
    };
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({}),
    } as unknown as HTMLCanvasElement;

    await renderPdfPage(doc as never, 2, canvas, { scale: 2 });

    expect(doc.getPage).toHaveBeenCalledWith(2);
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 });
    expect(canvas.width).toBe(1200);
  });

  test("throws when the canvas 2D context is unavailable", async () => {
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
      }),
      render: () => ({ promise: Promise.resolve() }),
    };
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;

    await expect(renderPdfPage(doc as never, 1, canvas)).rejects.toThrow(
      "Canvas 2D context unavailable",
    );
  });
});
