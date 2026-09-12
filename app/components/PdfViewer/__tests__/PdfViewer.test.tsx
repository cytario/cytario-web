import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterAll, describe, expect, test, vi } from "vitest";

// pdfjs-dist worker + DOM canvas are unavailable in happy-dom — mock the
// document surface and assert on the render spy.
const taskCancel = vi.fn();
const pageRender = vi.fn(() => ({ promise: Promise.resolve(), cancel: taskCancel }));
const mockPage = {
  getViewport: ({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  }),
  render: pageRender,
};
const mockDestroy = vi.fn(() => Promise.resolve(undefined));
const mockDoc = {
  numPages: 3,
  getPage: vi.fn(() => Promise.resolve(mockPage)),
  loadingTask: { destroy: mockDestroy },
};

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve(mockDoc) })),
  GlobalWorkerOptions: { workerSrc: "" },
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  resolveResourceId: () => ({
    connectionId: "c1",
    pathName: "docs/report.pdf",
    credentials: {},
    region: "eu-central-1",
    endpoint: null,
    s3Uri: "s3://bucket/docs/report.pdf",
    httpsUrl: "https://bucket.s3.eu-central-1.amazonaws.com/docs/report.pdf",
  }),
}));

import { PdfViewer } from "../PdfViewer";
import type { SignedFetch } from "~/utils/signedFetch";

// happy-dom's canvas returns no 2D context — patch getContext for this file.
// A plain override (not vi.spyOn) because vitest.setup's afterEach
// restoreAllMocks would restore a spy between tests.
const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext =
  (() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

const okFetch: SignedFetch = (async () =>
  new Response(new ArrayBuffer(8), { status: 200 })) as SignedFetch;

const renderViewer = (fetchImpl: SignedFetch = okFetch) =>
  render(<PdfViewer resourceId="c1/docs/report.pdf" signedFetch={fetchImpl} />);

describe("PdfViewer", () => {
  test("loads the document and renders page 1", async () => {
    renderViewer();

    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeVisible();
    });
    expect(pageRender).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  test("destroys the pdf.js loading task on unmount", async () => {
    const { unmount } = renderViewer();
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeVisible();
    });

    unmount();
    expect(mockDestroy).toHaveBeenCalled();
  });

  test("next/previous navigate and disable at the bounds", async () => {
    renderViewer();
    await waitFor(() => {
      expect(screen.getByText("Page 1 of 3")).toBeVisible();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeVisible();
    });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(screen.getByText("Page 3 of 3")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    await waitFor(() => {
      expect(screen.getByText("Page 2 of 3")).toBeVisible();
    });
  });

  test("zoom buttons update the zoom indicator between 50% and 400%", async () => {
    renderViewer();
    await waitFor(() => {
      expect(screen.getByText("Fit width")).toBeVisible();
    });

    await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    await waitFor(() => {
      expect(screen.getByText("125%")).toBeVisible();
    });

    // Up to the 400% ceiling.
    for (let i = 0; i < 12; i++) {
      await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    }
    await waitFor(() => {
      expect(screen.getByText("400%")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await waitFor(() => {
      expect(screen.getByText("325%")).toBeVisible();
    });
  });

  test("shows the error state with Retry when the signed fetch fails", async () => {
    const failingFetch: SignedFetch = (async () => {
      throw new Error("HTTP 403 loading PDF");
    }) as SignedFetch;
    renderViewer(failingFetch);

    await waitFor(() => {
      expect(screen.getByText("HTTP 403 loading PDF")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  test("a render failure with the document loaded shows the inline error, not the error state", async () => {
    pageRender.mockImplementationOnce(() => ({
      promise: Promise.reject(new Error("canvas render failed")),
      cancel: taskCancel,
    }));
    renderViewer();

    await waitFor(() => {
      expect(screen.getByText("canvas render failed")).toBeVisible();
    });
    // Document stays interactive — the toolbar is still rendered.
    expect(screen.getByText("Page 1 of 3")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });
});
