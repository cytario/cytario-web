import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";

import type { TableStore } from "../state/createTableStore";
import { useTableStore } from "../state/useTableStore";
import { ColumnConfig } from "../types";
import { useColumnWidths } from "../useColumnWidths";

// Mock the table store
vi.mock("../state/useTableStore");

// Mock zustand's useStore
vi.mock("zustand", async () => {
  const actual = await vi.importActual("zustand");
  return {
    ...actual,
    useStore: vi.fn(),
  };
});

describe("useColumnWidths", () => {
  const mockSetColumnWidth = vi.fn();
  const mockReset = vi.fn();
  let mockColumnWidths: Record<string, number>;
  let mockStoreApi: StoreApi<TableStore>;

  const testColumns: ColumnConfig[] = [
    { id: "name", header: "Name", size: 200 },
    { id: "date", header: "Date", size: 150 },
    { id: "size", header: "Size", size: 100 },
  ];

  const setupMock = (columnWidths: Record<string, number> = {}) => {
    mockColumnWidths = columnWidths;
    const mockStore: Partial<TableStore> = {
      tableId: "test-table",
      columnWidths: mockColumnWidths,
      sorting: [],
      setColumnWidth: mockSetColumnWidth,
      setSorting: vi.fn(),
      reset: mockReset,
    };

    mockStoreApi = {
      getState: () => mockStore as TableStore,
      subscribe: vi.fn(),
      destroy: vi.fn(),
      setState: vi.fn(),
    } as unknown as StoreApi<TableStore>;

    // Mock useTableStore to return our mock store API
    vi.mocked(useTableStore).mockReturnValue(mockStoreApi);

    // Mock useStore to return selected values from our mock
    vi.mocked(useStore).mockImplementation((store, selector) => {
      return selector(mockStore as TableStore);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMock({});
  });

  it("initializes with default column sizes when no persisted widths", () => {
    setupMock({});

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    expect(result.current.columnSizing).toEqual({
      index: 48,
      name: 200,
      date: 150,
      size: 100,
    });
  });

  it("uses persisted widths when available", () => {
    setupMock({
      name: 300,
      date: 200,
    });

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    expect(result.current.columnSizing).toEqual({
      index: 48,
      name: 300, // persisted
      date: 200, // persisted
      size: 100, // default
    });
  });

  it("setColumnSizing updates changed columns", () => {
    setupMock({ name: 200 });

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.setColumnSizing({
        index: 48,
        name: 250,
        date: 150,
        size: 100,
      });
    });

    // Should only update the column that changed
    expect(mockSetColumnWidth).toHaveBeenCalledTimes(1);
    expect(mockSetColumnWidth).toHaveBeenCalledWith("name", 250);
  });

  it("setColumnSizing does not update index column", () => {
    setupMock({});

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.setColumnSizing({
        index: 100, // Try to change index
        name: 200,
        date: 150,
        size: 100,
      });
    });

    // Should not call setColumnWidth for index
    expect(mockSetColumnWidth).not.toHaveBeenCalledWith(
      "index",
      expect.anything(),
    );
  });

  it("setColumnSizing handles updater function", () => {
    setupMock({ name: 200 });

    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.setColumnSizing((prev) => ({
        ...prev,
        name: 300,
      }));
    });

    expect(mockSetColumnWidth).toHaveBeenCalledWith("name", 300);
  });

  it("resetWidths calls store reset", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    act(() => {
      result.current.resetWidths();
    });

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it("always includes index column with fixed width of 48", () => {
    const { result } = renderHook(() =>
      useColumnWidths(testColumns, "test-table"),
    );

    expect(result.current.columnSizing.index).toBe(48);
  });
});
