import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { useDirectoryStore } from "../../DirectoryView/useDirectoryStore";
import { useTableSorting } from "../useTableSorting";

// Mock the store
vi.mock("../../DirectoryView/useDirectoryStore");

describe("useTableSorting", () => {
  const mockSetTableSorting = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDirectoryStore).mockReturnValue({
      tableSorting: {},
      setTableSorting: mockSetTableSorting,
    } as ReturnType<typeof useDirectoryStore>);
  });

  it("returns empty sorting array when no sorting exists for table", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));

    expect(result.current.sorting).toEqual([]);
  });

  it("returns existing sorting from store", () => {
    const existingSorting = [{ id: "name", desc: false }];
    vi.mocked(useDirectoryStore).mockReturnValue({
      tableSorting: { "test-table": existingSorting },
      setTableSorting: mockSetTableSorting,
    } as ReturnType<typeof useDirectoryStore>);

    const { result } = renderHook(() => useTableSorting("test-table"));

    expect(result.current.sorting).toEqual(existingSorting);
  });

  it("setSorting calls store with new sorting value", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));
    const newSorting = [{ id: "date", desc: true }];

    act(() => {
      result.current.setSorting(newSorting);
    });

    expect(mockSetTableSorting).toHaveBeenCalledWith("test-table", newSorting);
  });

  it("setSorting handles updater function", () => {
    const initialSorting = [{ id: "name", desc: false }];
    vi.mocked(useDirectoryStore).mockReturnValue({
      tableSorting: { "test-table": initialSorting },
      setTableSorting: mockSetTableSorting,
    } as ReturnType<typeof useDirectoryStore>);

    const { result } = renderHook(() => useTableSorting("test-table"));

    act(() => {
      result.current.setSorting((prev) => [
        ...prev,
        { id: "date", desc: true },
      ]);
    });

    expect(mockSetTableSorting).toHaveBeenCalledWith("test-table", [
      { id: "name", desc: false },
      { id: "date", desc: true },
    ]);
  });

  it("resetSorting clears sorting for the table", () => {
    const { result } = renderHook(() => useTableSorting("test-table"));

    act(() => {
      result.current.resetSorting();
    });

    expect(mockSetTableSorting).toHaveBeenCalledWith("test-table", []);
  });

  it("uses correct tableId for different tables", () => {
    const { result: result1 } = renderHook(() => useTableSorting("table-a"));
    const { result: result2 } = renderHook(() => useTableSorting("table-b"));

    act(() => {
      result1.current.setSorting([{ id: "col1", desc: false }]);
    });

    act(() => {
      result2.current.setSorting([{ id: "col2", desc: true }]);
    });

    expect(mockSetTableSorting).toHaveBeenCalledWith("table-a", [
      { id: "col1", desc: false },
    ]);
    expect(mockSetTableSorting).toHaveBeenCalledWith("table-b", [
      { id: "col2", desc: true },
    ]);
  });
});
