import { render, screen } from "@testing-library/react";
import React from "react";

import { AddOverlay } from "../AddOverlay";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { getOverlaySchema } from "~/utils/db/getOverlaySchema";
import type { OverlayConfig } from "~/utils/db/overlayConfig";

vi.mock("~/utils/db/getOverlaySchema", () => ({
  getOverlaySchema: vi.fn(),
}));

vi.mock("~/utils/connectionsStore/useConnectionsStore", () => ({
  useConnectionsStore: vi.fn(),
}));

vi.mock("~/utils/connectionsStore/selectors", () => ({
  select: { connections: () => ({ "conn-1": { id: "conn-1" } }) },
}));

vi.mock("~/utils/db/convertCsvToParquet", () => ({
  convertCsvToParquet: vi.fn(),
}));

vi.mock("~/components/ConnectionTree/ConnectionSwitcherChip", () => ({
  ConnectionSwitcherChip: () => <div />,
}));

vi.mock("~/components/ConnectionTree/ConnectionTree", () => ({
  ConnectionTree: ({ nodeLinkProps }: { nodeLinkProps: { onClick: (node: unknown) => void } }) => (
    <button
      onClick={() =>
        nodeLinkProps.onClick({
          type: "file",
          id: "my-conn/data/cells.parquet",
          name: "cells.parquet",
        })
      }
    >
      pick
    </button>
  ),
}));

const toast = vi.fn();

function renderAddOverlay(onOverlayAdd?: (o: Record<string, unknown>) => void) {
  (useConnectionsStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: unknown) =>
      (selector as (s: unknown) => unknown)({
        "conn-1": { id: "conn-1" },
        "conn-2": { id: "conn-2" },
      }),
  );
  render(
    <AddOverlayToastStub>
      <AddOverlay extension="parquet" onOverlayAdd={onOverlayAdd} callback={vi.fn()} />
    </AddOverlayToastStub>,
  );
}

vi.mock("@cytario/design", () => ({
  useToast: () => ({ toast }),
  Badge: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  EmptyState: ({ action }: { action?: React.ReactNode }) => <div>{action}</div>,
  Icon: () => <span />,
  IconButton: () => <button />,
  Input: () => <input />,
  Select: () => <div />,
}));

const AddOverlayToastStub = ({ children }: { children: React.ReactNode }) => <>{children}</>;

describe("AddOverlay parquet introspection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("adds the overlay with the interpreted config", async () => {
    const config: OverlayConfig = {
      version: 1,
      columns: { id: "object", geometry: "geom", x: "x", y: "y" },
      classes: [{ sourceColumn: "marker_positive_cd4", label: "cd4", mode: "boolean" }],
    };
    vi.mocked(getOverlaySchema).mockResolvedValue({
      schema: [],
      config,
    });
    const onOverlayAdd = vi.fn();

    renderAddOverlay(onOverlayAdd);
    screen.getByRole("button", { name: "pick" }).click();

    await vi.waitFor(() => {
      expect(onOverlayAdd).toHaveBeenCalledTimes(1);
    });
    expect(onOverlayAdd).toHaveBeenCalledWith({
      "my-conn/data/cells.parquet": { markers: {}, config },
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        message: expect.stringContaining("cells.parquet"),
      }),
    );
  });

  test("still adds the overlay and surfaces one actionable error when no mapping is viable", async () => {
    vi.mocked(getOverlaySchema).mockResolvedValue({ schema: [], config: null });
    const onOverlayAdd = vi.fn();

    renderAddOverlay(onOverlayAdd);
    screen.getByRole("button", { name: "pick" }).click();

    await vi.waitFor(() => {
      expect(onOverlayAdd).toHaveBeenCalledTimes(1);
    });
    expect(onOverlayAdd).toHaveBeenCalledWith({
      "my-conn/data/cells.parquet": { markers: {}, config: null },
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "error", message: expect.stringContaining("Configure") }),
    );
  });

  test("still adds the overlay when introspection throws", async () => {
    vi.mocked(getOverlaySchema).mockRejectedValue(new Error("network down"));
    const onOverlayAdd = vi.fn();

    renderAddOverlay(onOverlayAdd);
    screen.getByRole("button", { name: "pick" }).click();

    await vi.waitFor(() => {
      expect(onOverlayAdd).toHaveBeenCalledTimes(1);
    });
    expect(onOverlayAdd).toHaveBeenCalledWith({
      "my-conn/data/cells.parquet": { markers: {}, config: null },
    });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "error",
        message: expect.stringContaining("network down"),
      }),
    );
  });
});
