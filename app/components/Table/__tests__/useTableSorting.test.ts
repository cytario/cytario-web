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
  const mockReset = vi.fn();
  let mockSorting: SortingState;
  let mockStoreApi: StoreApi<TableStore>;

  const setupMock = (sorting: SortingState = []) => {
    mockSorting = sorting;
    const mockStore: Partial<TableStore> = {
      tableId: "test-table",
      columnWidths: {},
      sorting: mockSorting,
      setColumnWidth: vi.fn(),
      setSorting: mockSetSorting,
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
    setupMock([]);
  });

  it("returns empty sorting array when no sorting exists", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));

    expect(result.current.sorting).toEqual([]);
  });

  it("returns existing sorting from store", () => {
    const existingSorting = [{ id: "name", desc: false }];
    setupMock(existingSorting);

    const { result } = renderHook(() => useTableSorting("test-table"));

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

  it("setSorting handles updater function", () => {
    const initialSorting = [{ id: "name", desc: false }];
    setupMock(initialSorting);

    const { result } = renderHook(() => useTableSorting("test-table"));

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

  it("resetSorting clears sorting for the table", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));

    act(() => {
      result.current.resetSorting();
    });

    expect(mockReset).toHaveBeenCalledTimes(1);
  });
});
