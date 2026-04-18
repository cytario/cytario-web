import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FilterBar } from "../FilterBar";
import { useTableStore } from "~/components/Table/state/useTableStore";
import type { ColumnConfig } from "~/components/Table/types";

const textColumn: ColumnConfig = {
  id: "name",
  header: "Name",
  size: 200,
  enableColumnFilter: true,
  filterType: "text",
  filterPlaceholder: "Filter by name...",
};

const selectColumn: ColumnConfig = {
  id: "file_type",
  header: "Type",
  size: 160,
  enableColumnFilter: true,
  filterType: "select",
  filterOptions: [
    { label: "CSV", value: "CSV" },
    { label: "Parquet", value: "Parquet" },
  ],
};

const nonFilterableColumn: ColumnConfig = {
  id: "size",
  header: "Size",
  size: 120,
  enableColumnFilter: false,
};

const TEST_TABLE_ID = "filter-bar-test";

describe("FilterBar", () => {
  beforeEach(() => {
    useTableStore(TEST_TABLE_ID).getState().setColumnFilters([]);
  });

  test("renders a control per filterable column", () => {
    render(
      <FilterBar
        columns={[textColumn, selectColumn, nonFilterableColumn]}
        tableId={TEST_TABLE_ID}
      />,
    );

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Type")).toBeInTheDocument();
    // Non-filterable column has no control
    expect(screen.queryByLabelText("Size")).not.toBeInTheDocument();
  });

  test("renders nothing when no columns are filterable", () => {
    const { container } = render(
      <FilterBar columns={[nonFilterableColumn]} tableId={TEST_TABLE_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  test("writing a text filter updates the shared store", async () => {
    const user = userEvent.setup();
    render(<FilterBar columns={[textColumn]} tableId={TEST_TABLE_ID} />);

    const input = screen.getByLabelText("Name");
    await user.type(input, "foo");

    const filters = useTableStore(TEST_TABLE_ID).getState().columnFilters;
    expect(filters).toEqual([{ id: "name", value: "foo" }]);
  });

  test("clearing a text filter removes it from the store", async () => {
    const user = userEvent.setup();
    useTableStore(TEST_TABLE_ID)
      .getState()
      .setColumnFilters([{ id: "name", value: "hello" }]);

    render(<FilterBar columns={[textColumn]} tableId={TEST_TABLE_ID} />);
    await user.click(screen.getByLabelText("Clear Name filter"));

    const filters = useTableStore(TEST_TABLE_ID).getState().columnFilters;
    expect(filters).toEqual([]);
  });

  test("'Clear all' resets every filter", async () => {
    const user = userEvent.setup();
    useTableStore(TEST_TABLE_ID)
      .getState()
      .setColumnFilters([
        { id: "name", value: "foo" },
        { id: "file_type", value: "CSV" },
      ]);

    render(
      <FilterBar
        columns={[textColumn, selectColumn]}
        tableId={TEST_TABLE_ID}
      />,
    );

    await user.click(screen.getByRole("button", { name: /clear all/i }));

    const filters = useTableStore(TEST_TABLE_ID).getState().columnFilters;
    expect(filters).toEqual([]);
  });

  test("reflects existing store state on mount", () => {
    useTableStore(TEST_TABLE_ID)
      .getState()
      .setColumnFilters([{ id: "name", value: "preset" }]);

    render(<FilterBar columns={[textColumn]} tableId={TEST_TABLE_ID} />);

    const input = screen.getByLabelText("Name") as HTMLInputElement;
    expect(input.value).toBe("preset");
  });
});
