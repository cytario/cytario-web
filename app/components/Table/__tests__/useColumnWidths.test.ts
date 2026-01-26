import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useDirectoryStore } from "../../DirectoryView/useDirectoryStore";
import type { ColumnConfig } from "../types";
import { useColumnWidths } from "../useColumnWidths";

// Mock the store
vi.mock("../../DirectoryView/useDirectoryStore");

describe("useColumnWidths", () => {
  const mockSetColumnWidth = vi.fn();
  const mockResetTableConfig = vi.fn();
  let mockTableColumns: Record<string, Record<string, { width: number }>>;

  const testColumns: ColumnConfig[] = [
    { id: "name", header: "Name", size: 200 },
    { id: "date", header: "Date", size: 150 },
    { id: "size", header: "Size", size: 100 },
  ];

  const setupMock = (tableColumns = {}) => {
    mockTableColumns = tableColumns;
    vi.mocked(useDirectoryStore).mockReturnValue({
      tableColumns: mockTableColumns,
      setColumnWidth: mockSetColumnWidth,
      resetTableConfig: mockResetTableConfig,
    } as ReturnType<typeof useDirectoryStore>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMock({});
  });

  it("initializes with default column sizes when no persisted widths", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    expect(result.current.columnSizing).toEqual({
      name: 200,
      date: 150,
      size: 100,
      index: 48,
    });
  });

  it("uses persisted widths from store when available", () => {
    setupMock({
      "test-table": {
        name: { width: 300 },
        date: { width: 180 },
      },
    });

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    expect(result.current.columnSizing).toEqual({
      name: 300,
      date: 180,
      size: 100, // falls back to default
      index: 48,
    });
  });

  it("setColumnSizing persists changed widths to store", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.setColumnSizing({
        name: 250,
        date: 150,
        size: 100,
        index: 48,
      });
    });

    expect(mockSetColumnWidth).toHaveBeenCalledWith("test-table", "name", 250);
    // date and size unchanged, should not be called
    expect(mockSetColumnWidth).not.toHaveBeenCalledWith(
      "test-table",
      "date",
      150,
    );
  });

  it("setColumnSizing handles updater function", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.setColumnSizing((prev) => ({
        ...prev,
        name: prev.name + 50,
      }));
    });

    expect(mockSetColumnWidth).toHaveBeenCalledWith("test-table", "name", 250);
  });

  it("does not persist index column width changes", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.setColumnSizing({
        name: 200,
        date: 150,
        size: 100,
        index: 60, // try to change index width
      });
    });

    expect(mockSetColumnWidth).not.toHaveBeenCalledWith(
      "test-table",
      "index",
      expect.any(Number),
    );
  });

  it("resetWidths calls resetTableConfig", () => {
    setupMock({
      "test-table": {
        name: { width: 300 },
        date: { width: 180 },
      },
    });

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    // Initial state uses persisted widths
    expect(result.current.columnSizing.name).toBe(300);

    act(() => {
      result.current.resetWidths();
    });

    expect(mockResetTableConfig).toHaveBeenCalledWith("test-table");
  });

  it("always includes index column with fixed width of 48", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    expect(result.current.columnSizing.index).toBe(48);
  });
});
