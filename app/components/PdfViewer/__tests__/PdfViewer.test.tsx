import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { getDocument } from "pdfjs-dist";
import { beforeAll, describe, expect, test, vi } from "vitest";

import { PdfViewer } from "../PdfViewer";
import type { SignedFetch } from "~/utils/signedFetch";

// happy-dom's canvas returns no 2D context — patch getContext before the
// component mounts so renderPdfPage can proceed.
beforeAll(() => {
  const proto = HTMLCanvasElement.prototype as unknown as {
    getContext: () => unknown;
  };
  proto.getContext = () => ({});
});

// pdfjs-dist worker + DOM canvas are unavailable in happy-dom — mock the
// document surface and assert on the render spy.
void getDocument;
const pageRender = vi.fn(() => ({ promise: Promise.resolve() }));
const mockPage = {
  getViewport: ({ scale }: { scale: number }) => ({
    width: 600 * scale,
    height: 800 * scale,
  }),
  render: pageRender,
};
const mockDoc = {
  numPages: 3,
  getPage: vi.fn().mockResolvedValue(mockPage),
  loadingTask: { destroy: vi.fn().mockResolvedValue(undefined) },
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

    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    await waitFor(() => {
      expect(screen.getByText("50%")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  });

  test("shows the error state with Retry when the signed fetch fails", async () => {
    const failingFetch: SignedFetch = (async () => {
      throw new Error("HTTP 403 loading PDF");
    }) as SignedFetch;
    renderViewer(failingFetch);

    await waitFor(() => {
      expect(screen.getByText("Error: HTTP 403 loading PDF")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});
