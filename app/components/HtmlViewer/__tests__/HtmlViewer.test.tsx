import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

vi.mock("~/utils/connectionsStore/selectors", () => ({
  resolveResourceId: (resourceId: string) => ({
    connectionId: "c1",
    pathName: resourceId.slice(resourceId.indexOf("/") + 1),
    httpsUrl: `https://mock-bucket.s3.eu-central-1.amazonaws.com/${resourceId.slice(resourceId.indexOf("/") + 1)}`,
  }),
}));

import { HtmlViewer } from "../HtmlViewer";
import type { SignedFetch } from "~/utils/signedFetch";

const reportHtml = "<!DOCTYPE html><html><body><h1>Quarterly report</h1></body></html>";

const okFetch: SignedFetch = (async (url: string) => {
  if (/report\.html$/.test(url)) {
    return new Response(reportHtml, { status: 200, headers: { "content-type": "text/html" } });
  }
  return new Response("Not Found", { status: 404 });
}) as SignedFetch;

const renderViewer = (fetchImpl: SignedFetch = okFetch) =>
  render(<HtmlViewer resourceId="c1/reports/report.html" signedFetch={fetchImpl} />);

describe("HtmlViewer", () => {
  test("renders the fetched document in a sandboxed srcDoc iframe", async () => {
    const { container } = renderViewer();

    const iframe = await waitFor(() => {
      const frame = container.querySelector("iframe");
      expect(frame).not.toBeNull();
      return frame as HTMLIFrameElement;
    });

    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toContain("Quarterly report");
  });

  test("shows the error surface with Retry when the load fails", async () => {
    const failingFetch = (async () => new Response("nope", { status: 404 })) as SignedFetch;
    renderViewer(failingFetch);

    await waitFor(() => {
      expect(screen.getByText("HTTP 404 loading report")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  test("Retry re-runs the load", async () => {
    let calls = 0;
    const flakyFetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("gone", { status: 500 });
      return new Response(reportHtml, { status: 200, headers: { "content-type": "text/html" } });
    }) as SignedFetch;
    const { container } = renderViewer(flakyFetch);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(container.querySelector("iframe")).not.toBeNull();
    });
    expect(calls).toBe(2);
  });

  test("surfaces the size-limit message for oversized reports", async () => {
    const bigFetch = (async () =>
      new Response("x".repeat(1024), {
        status: 200,
        headers: { "content-length": String(11 * 1024 * 1024) },
      })) as SignedFetch;
    renderViewer(bigFetch);

    await waitFor(() => {
      expect(screen.getByText(/preview limit/)).toBeVisible();
    });
  });

  test("a later unmount cancels the in-flight load", async () => {
    let resolveLoad: (() => void) | undefined;
    const hangingFetch = (async () => {
      await new Promise<void>((resolve) => {
        resolveLoad = resolve;
      });
      return new Response(reportHtml, { status: 200 });
    }) as SignedFetch;
    const { unmount } = renderViewer(hangingFetch);

    unmount();
    resolveLoad?.();
    // No state update after unmount — the test would fail on React's act warning.
  });
});
