import type { SortingState } from "@tanstack/react-table";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StoreApi } from "zustand";
import { useStore } from "zustand";

import type { TableStore } from "../state/createTableStore";
import { useTableStore } from "../state/useTableStore";
import { useTableSorting } from "../useTableSorting";

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

describe("useTableSorting", () => {
  const mockSetSorting = vi.fn();
  let mockSorting: SortingState;
  let mockStoreApi: StoreApi<TableStore>;

  const setupMock = (sorting: SortingState = []) => {
    mockSorting = sorting;
    const mockStore: Partial<TableStore> = {
      tableId: "test-table",
      columnWidths: {},
      sorting: mockSorting,
      columnVisibility: {},
      columnFilters: [],
      setColumnWidth: vi.fn(),
      setSorting: mockSetSorting,
      setColumnVisibility: vi.fn(),
      setColumnFilters: vi.fn(),
      reset: vi.fn(),
    };

    mockStoreApi = {
      getState: () => mockStore as TableStore,
      subscribe: vi.fn(),
      destroy: vi.fn(),
      setState: vi.fn(),
    } as unknown as StoreApi<TableStore>;

    vi.mocked(useTableStore).mockReturnValue(mockStoreApi);

    vi.mocked(useStore).mockImplementation((store, selector) => {
      return selector(mockStore as TableStore);
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setupMock([]);
  });

  it("returns default sorting when store is empty and defaultSortColumnId is provided", () => {
    const { result } = renderHook(() =>
      useTableSorting("test-table", "name"),
    );

    expect(result.current.sorting).toEqual([{ id: "name", desc: false }]);
  });

  it("returns empty sorting when store is empty and no default is provided", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));

    expect(result.current.sorting).toEqual([]);
  });

  it("returns stored sorting over default", () => {
    const existingSorting = [{ id: "date", desc: true }];
    setupMock(existingSorting);

    const { result } = renderHook(() =>
      useTableSorting("test-table", "name"),
    );

    expect(result.current.sorting).toEqual(existingSorting);
  });

  it("setSorting calls store with new sorting value", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));
    const newSorting = [{ id: "date", desc: true }];

    act(() => {
      result.current.setSorting(newSorting);
    });

    expect(mockSetSorting).toHaveBeenCalledWith(newSorting);
  });

  it("setSorting handles updater function with default sorting as base", () => {
    // Store is empty, default is "name"
    const { result } = renderHook(() =>
      useTableSorting("test-table", "name"),
    );

    act(() => {
      result.current.setSorting((prev) => [
        ...prev,
        { id: "date", desc: true },
      ]);
    });

    expect(mockSetSorting).toHaveBeenCalledWith([
      { id: "name", desc: false },
      { id: "date", desc: true },
    ]);
  });
});
