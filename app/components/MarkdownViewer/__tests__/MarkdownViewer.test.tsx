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

vi.mock("../../TextEditor/TextEditor", () => ({
  TextEditor: () => <div data-testid="text-editor-mock" />,
}));

import { MarkdownViewer } from "../MarkdownViewer";
import type { SignedFetch } from "~/utils/signedFetch";

const markdownSource = [
  "# Batch README",
  "",
  "| Marker | Stain |",
  "| --- | --- |",
  "| CD3 | DAB |",
  "",
  "```",
  "SELECT 1;",
  "```",
  "",
  "[Protocol](https://example.com/protocol)",
].join("\n");

const okFetch: SignedFetch = (async () =>
  new Response(markdownSource, {
    status: 200,
    headers: { "content-type": "text/markdown" },
  })) as SignedFetch;

const renderViewer = (fetchImpl: SignedFetch = okFetch) =>
  render(<MarkdownViewer resourceId="c1/batch/README.md" signedFetch={fetchImpl} />);

describe("MarkdownViewer", () => {
  test("renders headings, tables, code blocks, and links from the fetched source", async () => {
    renderViewer();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Batch README" })).toBeVisible();
    });

    const link = screen.getByRole("link", { name: "Protocol" });
    expect(link).toHaveAttribute("href", "https://example.com/protocol");
    expect(link).toHaveAttribute("target", "_blank");

    expect(screen.getByText("CD3")).toBeVisible();
    expect(screen.getByText("SELECT 1;")).toBeVisible();
  });

  test("renders raw HTML in the source as literal text, not markup", async () => {
    const htmlFetch = (async () =>
      new Response("# Title\n\n<img src=x onerror=alert(1)>", {
        status: 200,
      })) as SignedFetch;
    renderViewer(htmlFetch);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeVisible();
    });

    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByText(/onerror/)).toBeVisible();
  });

  test("shows the error surface with Retry when the load fails", async () => {
    const failingFetch = (async () => new Response("nope", { status: 404 })) as SignedFetch;
    renderViewer(failingFetch);

    await waitFor(() => {
      expect(screen.getByText("HTTP 404 loading markdown")).toBeVisible();
    });
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  test("Retry re-runs the load", async () => {
    let calls = 0;
    const flakyFetch = (async () => {
      calls += 1;
      if (calls === 1) return new Response("gone", { status: 500 });
      return new Response(markdownSource, { status: 200 });
    }) as SignedFetch;
    renderViewer(flakyFetch);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    });
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Batch README" })).toBeVisible();
    });
    expect(calls).toBe(2);
  });

  test("surfaces the size-limit message for oversized files", async () => {
    const bigFetch = (async () =>
      new Response("x".repeat(1024), {
        status: 200,
        headers: { "content-length": String(51 * 1024 * 1024) },
      })) as SignedFetch;
    renderViewer(bigFetch);

    await waitFor(() => {
      expect(screen.getByText(/preview limit/)).toBeVisible();
    });
  });

  test("Edit switches to the Text Editor", async () => {
    renderViewer();

    const editButton = await waitFor(() => {
      const button = screen.getByRole("button", { name: "Edit" });
      expect(button).toBeVisible();
      return button;
    });
    await userEvent.click(editButton);

    expect(screen.getByTestId("text-editor-mock")).toBeVisible();
  });

  test("a later unmount cancels the in-flight load", async () => {
    let resolveLoad: (() => void) | undefined;
    const hangingFetch = (async () => {
      await new Promise<void>((resolve) => {
        resolveLoad = resolve;
      });
      return new Response(markdownSource, { status: 200 });
    }) as SignedFetch;
    const { unmount } = renderViewer(hangingFetch);

    unmount();
    resolveLoad?.();
  });
});
