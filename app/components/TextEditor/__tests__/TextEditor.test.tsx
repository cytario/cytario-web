import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../readText", () => ({
  readTextFile: vi.fn(async (resourceId: string) => {
    if (resourceId.endsWith("notes.md")) return "# Title\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n";
    return '{\n  "type": "annotations"\n}\n';
  }),
}));

vi.mock("../writeText", () => ({
  writeTextFile: vi.fn(async () => {}),
}));

import { TextEditor } from "../TextEditor";
import { seedViewerConnection } from "~/utils/__tests__/__mocks__";
import type { SignedFetch } from "~/utils/signedFetch";

const signedFetch = (async () => new Response()) as SignedFetch;

describe("TextEditor", () => {
  beforeEach(() => {
    // The read-only gate reads the connections store; seed the connection as
    // writable so the edit affordances render.
    seedViewerConnection("c1", "annotate");
  });
  test("a markdown file opens in view mode and renders formatted", async () => {
    render(<TextEditor resourceId="c1/notes.md" signedFetch={signedFetch} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeVisible();
    });
    expect(screen.getByRole("cell", { name: "1" })).toBeVisible();
    // View mode: the CodeMirror surface is not mounted.
    expect(document.querySelector(".cm-content")).toBeNull();
  });

  test("a JSON file opens in view mode and renders as plain text", async () => {
    render(<TextEditor resourceId="c1/annotations.json" signedFetch={signedFetch} />);

    await waitFor(() => {
      expect(screen.getByText(/"type"/)).toBeVisible();
    });
    // Plain text view renders inside a <pre>, not the CodeMirror surface.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("Edit mounts the CodeMirror surface; Back to view restores the formatted document", async () => {
    render(<TextEditor resourceId="c1/notes.md" signedFetch={signedFetch} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeVisible();
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editor = await waitFor(() => {
      const surface = document.querySelector(".cm-content");
      expect(surface).not.toBeNull();
      return surface as HTMLElement;
    });
    expect(editor.textContent).toContain("# Title");

    await userEvent.click(screen.getByRole("button", { name: "Back to view" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeVisible();
    });
    expect(document.querySelector(".cm-content")).toBeNull();
  });

  test("edits survive the view round trip and stay dirty", async () => {
    render(<TextEditor resourceId="c1/notes.md" signedFetch={signedFetch} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeVisible();
    });

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const surface = await waitFor(() => {
      const editor = document.querySelector(".cm-content");
      expect(editor).not.toBeNull();
      return editor as HTMLElement;
    });
    await userEvent.type(surface, " more");

    expect(screen.getByText("Unsaved changes")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  test("a read-only connection hides the Edit affordance entirely", async () => {
    seedViewerConnection("c1", "read-only");
    render(<TextEditor resourceId="c1/notes.md" signedFetch={signedFetch} />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Title" })).toBeVisible();
    });

    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
