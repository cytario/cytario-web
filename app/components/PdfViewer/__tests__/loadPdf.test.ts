import { getDocument } from "pdfjs-dist";
import { describe, expect, test, vi } from "vitest";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { loadPdfDocument, MAX_PDF_BYTES, renderPdfPage } from "../loadPdf";
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
    getDocumentSpy.mockImplementationOnce(
      () =>
        ({ promise: Promise.resolve({} as never) }) as unknown as ReturnType<typeof getDocument>,
    );

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

  test("rejects an object whose content-length exceeds the preview ceiling", async () => {
    const signedFetch: SignedFetch = (async () =>
      new Response(new ArrayBuffer(8), {
        status: 200,
        headers: { "content-length": String(MAX_PDF_BYTES + 1) },
      })) as SignedFetch;

    await expect(loadPdfDocument("c1/docs/report.pdf", signedFetch)).rejects.toThrow(
      "PDF exceeds the 256 MB preview limit",
    );
  });

  test("accepts a body under the ceiling when content-length is absent", async () => {
    const signedFetch: SignedFetch = (async () =>
      new Response(new ArrayBuffer(8), { status: 200 })) as SignedFetch;
    const getDocumentSpy = vi.mocked(getDocument);
    getDocumentSpy.mockImplementationOnce(
      () =>
        ({ promise: Promise.resolve({} as never) }) as unknown as ReturnType<typeof getDocument>,
    );

    await expect(loadPdfDocument("c1/docs/report.pdf", signedFetch)).resolves.toBeDefined();
  });
});

describe("renderPdfPage", () => {
  const makePage = () => ({
    getViewport: vi.fn(({ scale }: { scale: number }) => ({
      width: 600 * scale,
      height: 800 * scale,
    })),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  });
  const makeCanvas = () =>
    ({
      width: 0,
      height: 0,
      style: {} as CSSStyleDeclaration,
      getContext: () => ({}),
    }) as unknown as HTMLCanvasElement;

  test("scales the viewport to fit the width when no scale is given", async () => {
    const page = makePage();
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = makeCanvas();

    const handle = await renderPdfPage(doc as never, 1, canvas, { fitWidth: 300 });
    await handle.done;

    // Base page is 600 CSS px wide; fitting into 300 px must halve the scale.
    // Viewport calls carry the device pixel ratio, CSS sizing does not.
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 0.5 * (window.devicePixelRatio || 1) });
    expect(canvas.style.width).toBe("300px");
    expect(canvas.style.height).toBe("400px");
  });

  test("clamps fit-width scale to the 50% zoom floor", async () => {
    const page = makePage();
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = makeCanvas();

    // 150 px floor against a 600 px page would be 25% — clamped to MIN_ZOOM.
    const handle = await renderPdfPage(doc as never, 1, canvas, { fitWidth: 150 });
    await handle.done;

    expect(page.getViewport).toHaveBeenCalledWith({ scale: 0.5 * (window.devicePixelRatio || 1) });
    expect(canvas.style.width).toBe("300px");
  });

  test("uses the explicit scale when provided", async () => {
    const page = makePage();
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = makeCanvas();

    const handle = await renderPdfPage(doc as never, 2, canvas, { scale: 2 });
    await handle.done;

    expect(doc.getPage).toHaveBeenCalledWith(2);
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 2 * (window.devicePixelRatio || 1) });
    expect(canvas.style.width).toBe("1200px");
  });

  test("exposes the render task for cancellation", async () => {
    const cancel = vi.fn();
    const page = {
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel }),
    };
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = makeCanvas();

    const handle = await renderPdfPage(doc as never, 1, canvas);
    handle.cancel();

    expect(cancel).toHaveBeenCalledTimes(1);
  });

  test("throws when the canvas 2D context is unavailable", async () => {
    const page = makePage();
    const doc = { getPage: vi.fn().mockResolvedValue(page) };
    const canvas = {
      style: {} as CSSStyleDeclaration,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    await expect(renderPdfPage(doc as never, 1, canvas)).rejects.toThrow(
      "Canvas 2D context unavailable",
    );
  });
});
