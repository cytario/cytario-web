import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

import type { OverlayEntry } from "../../../../state/store/types";
import { useViewerStore } from "../../../../state/store/ViewerStoreContext";
import { OverlayConfigModal } from "../OverlayConfig.modal";
import { getParquetSchema } from "~/components/DataGrid/getParquetSchema";
import { getMarkerInfoWasm } from "~/utils/db/getMarkerInfoWasm";

vi.mock("../../../../state/store/ViewerStoreContext", () => ({
  useViewerStore: vi.fn(),
}));

vi.mock("~/components/DataGrid/getParquetSchema", () => ({
  getParquetSchema: vi.fn(),
}));

vi.mock("~/utils/db/getMarkerInfoWasm", () => ({
  getMarkerInfoWasm: vi.fn(),
}));

vi.mock("~/components/RouteModal", () => ({
  RouteModal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

const makeOverlay = (): OverlayEntry => ({
  markers: {},
  config: {
    version: 1,
    columns: { id: "object", geometry: "geom", x: "x", y: "y" },
    classes: [{ sourceColumn: "marker_positive_cd4", label: "CD4", mode: "boolean" }],
  },
});

const schema = [
  { name: "object", type: "INT32" },
  { name: "x", type: "DOUBLE" },
  { name: "y", type: "DOUBLE" },
  { name: "geom", type: "VARCHAR" },
  { name: "marker_positive_cd4", type: "BOOLEAN" },
  { name: "name", type: "VARCHAR" },
];

const updateOverlayConfigMock = vi.fn();
const updateOverlaysStateMock = vi.fn();

function setup(overlay = makeOverlay()) {
  (useViewerStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: unknown) =>
    (selector as (s: unknown) => unknown)({
      updateOverlayConfig: updateOverlayConfigMock,
      updateOverlaysState: updateOverlaysStateMock,
    }),
  );
  const onClose = vi.fn();
  render(<OverlayConfigModal resourceId="conn/data.parquet" overlay={overlay} onClose={onClose} />);
  return { updateOverlayConfig: updateOverlayConfigMock, onClose };
}

describe("OverlayConfigModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getParquetSchema).mockResolvedValue(schema);
    vi.mocked(getMarkerInfoWasm).mockResolvedValue({ marker_positive_cd4: { count: 7 } });
  });

  test("renders column selectors populated from the schema", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getAllByText("object").length).toBeGreaterThan(0);
    });
    expect(screen.getByText("Cell ID column")).toBeInTheDocument();
    expect(screen.getByText("Geometry column")).toBeInTheDocument();
    expect(screen.getByText("X column")).toBeInTheDocument();
    expect(screen.getByText("Y column")).toBeInTheDocument();
    expect(screen.getByDisplayValue("CD4")).toBeInTheDocument();
    expect(screen.getAllByText("marker_positive_cd4").length).toBeGreaterThan(0);
  });

  test("Apply calls updateOverlayConfig with the built config", async () => {
    const { updateOverlayConfig } = setup();

    const apply = await screen.findByRole("button", { name: "Apply" });
    apply.click();

    await waitFor(() => {
      expect(updateOverlayConfig).toHaveBeenCalledTimes(1);
    });
    const [resourceId, config] = vi.mocked(updateOverlayConfig).mock.calls[0];
    expect(resourceId).toBe("conn/data.parquet");
    expect(config.columns).toEqual({
      id: "object",
      geometry: "geom",
      x: "x",
      y: "y",
    });
    expect(config.classes).toEqual([
      { sourceColumn: "marker_positive_cd4", label: "CD4", mode: "boolean" },
    ]);
  });

  test("disables Apply while the schema is loading", async () => {
    vi.mocked(getParquetSchema).mockReturnValue(new Promise(() => {}) as never);
    setup();

    const apply = await screen.findByRole("button", { name: "Apply" });
    expect(apply).toBeDisabled();
  });

  test("shows a schema error banner when introspection fails", async () => {
    vi.mocked(getParquetSchema).mockRejectedValue(new Error("boom"));
    setup();

    await waitFor(() => {
      expect(screen.getByText("boom")).toBeInTheDocument();
    });
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.startsWith("Schema unavailable") ?? false,
      ).length,
    ).toBeGreaterThan(0);
  });

  test("renders class rows from the existing config", async () => {
    setup();
    expect(await screen.findAllByText("Class 1 source column")).toHaveLength(1);
    expect(screen.getByText("Class 1 label")).toBeInTheDocument();
  });

  test("reveals operator and threshold inputs when the mode switches to threshold", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Interpretation mode")).toBeInTheDocument());

    expect(screen.queryByText("Operator")).toBeNull();
    expect(screen.queryByText("Threshold")).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Interpretation mode/ }));
    await user.click(await screen.findByRole("option", { name: "Intensity threshold" }));

    await waitFor(() => {
      expect(screen.getByText("Operator")).toBeInTheDocument();
      expect(screen.getByText("Threshold")).toBeInTheDocument();
    });
  });

  test("the continuous mode stays non-selectable", async () => {
    setup();
    await waitFor(() => expect(screen.getByText("Interpretation mode")).toBeInTheDocument());

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Interpretation mode/ }));

    expect(await screen.findByRole("option", { name: "Boolean category" })).toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "Intensity threshold" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Continuous intensity" })).toBeNull();
  });

  test("Apply is disabled and shows an inline error when the id column is missing from the schema", async () => {
    setup({
      markers: {},
      config: {
        version: 1,
        columns: { id: "missing", geometry: "geom", x: "x", y: "y" },
        classes: [{ sourceColumn: "marker_positive_cd4", label: "CD4", mode: "boolean" }],
      },
    });

    const apply = await screen.findByRole("button", { name: "Apply" });
    await waitFor(() => {
      expect(apply).toBeDisabled();
    });

    // Apply is unreachable while invalid; a programmatic press is still a no-op.
    apply.click();
    await waitFor(() => {
      expect(screen.getByText("Configure Overlay")).toBeInTheDocument();
    });
    expect(updateOverlayConfigMock).not.toHaveBeenCalled();
    expect(getMarkerInfoWasm).not.toHaveBeenCalled();
  });

  test("Apply is disabled when the x column no longer exists in the schema", async () => {
    setup({
      markers: {},
      config: {
        version: 1,
        columns: { id: "object", geometry: "geom", x: "renamed", y: "y" },
        classes: [{ sourceColumn: "marker_positive_cd4", label: "CD4", mode: "boolean" }],
      },
    });

    const apply = await screen.findByRole("button", { name: "Apply" });
    await waitFor(() => {
      expect(apply).toBeDisabled();
    });
  });

  test("Apply builds a threshold class from the operator and threshold inputs", async () => {
    const { updateOverlayConfig } = setup({
      markers: {},
      config: {
        version: 1,
        columns: { id: "object", geometry: "geom", x: "x", y: "y" },
        classes: [
          {
            sourceColumn: "x",
            label: "CD8",
            mode: "threshold",
            operator: ">",
            threshold: 3,
          },
        ],
      },
    });

    const apply = await screen.findByRole("button", { name: "Apply" });
    apply.click();

    await waitFor(() => expect(updateOverlayConfig).toHaveBeenCalledTimes(1));
    const [, config] = vi.mocked(updateOverlayConfig).mock.calls[0];
    expect(config.classes[0]).toEqual({
      sourceColumn: "x",
      label: "CD8",
      mode: "threshold",
      operator: ">",
      threshold: 3,
    });
  });
});
