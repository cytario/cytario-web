import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const toast = vi.fn();
const orgNavigate = vi.fn();

vi.mock("@cytario/design", () => ({
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button aria-label={label} onClick={onPress} type="button" />
  ),
  useToast: () => ({ toast }),
}));

vi.mock("~/hooks/useCurrentUser", () => ({
  useCurrentUser: () => ({ sub: "user-1" }),
}));

vi.mock("~/hooks/useOrgPath", () => ({
  useOrgNavigate: () => orgNavigate,
}));

vi.mock("~/lib/imageMetadata", () => ({
  ensureBuiltinFormats: async () => {},
}));

import { OpenLocalFileButton } from "../OpenLocalFileButton";
import type { FormatHandler } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";

const stubHandler = (supportsLocalSource = true): FormatHandler => ({
  load: async () => ({
    data: [],
    metadata: {
      Pixels: {
        Type: "Uint8" as const,
        Channels: [],
        SizeX: 0,
        SizeY: 0,
        PhysicalSizeXUnit: "",
        PhysicalSizeYUnit: "",
        PhysicalSizeZUnit: "",
      },
    },
  }),
  supportsLocalSource,
});

const pick = (fileName: string) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (!input) throw new Error("no file input rendered");
  fireEvent.change(input, {
    target: { files: [new File([new ArrayBuffer(8)], fileName)] },
  });
};

describe("OpenLocalFileButton dispatch", () => {
  beforeEach(() => {
    formatRegistry.__reset();
    toast.mockReset();
    orgNavigate.mockReset();
    formatRegistry.add("cytario-web", ["ome.tif", "ome.tiff"], stubHandler());
  });

  test("navigates to the local viewer for a locally-openable image name", async () => {
    render(<OpenLocalFileButton />);

    pick("slide.ome.tif");

    await waitFor(() =>
      expect(orgNavigate).toHaveBeenCalledWith(expect.stringMatching(/\/local\/slide\.ome\.tif$/)),
    );
    expect(toast).not.toHaveBeenCalled();
  });

  test("surfaces the bucket notice for a bucket-dispatchable non-image name", async () => {
    render(<OpenLocalFileButton />);

    pick("results.csv");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "info",
          message:
            '"results.csv" opens from a connected bucket. Local viewing is ' +
            "available for whole-slide image files only. Nothing was uploaded.",
        }),
      ),
    );
    expect(orgNavigate).not.toHaveBeenCalled();
  });

  test("surfaces the not-openable notice for a type no viewer can open", async () => {
    render(<OpenLocalFileButton />);

    pick("CMU-1.tiff");

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "info",
          message: '"CMU-1.tiff" is not a file type cytario can open. ' + "Nothing was uploaded.",
        }),
      ),
    );
    expect(orgNavigate).not.toHaveBeenCalled();
  });

  test("surfaces the notice for an image name whose loader is URL-only", async () => {
    formatRegistry.__reset();
    formatRegistry.add("cytario-web", ["ome.tif", "ome.tiff"], stubHandler(false));
    render(<OpenLocalFileButton />);

    pick("slide.ome.tif");

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(orgNavigate).not.toHaveBeenCalled();
  });
});
