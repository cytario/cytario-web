import { render, screen } from "@testing-library/react";

import { formatScopeLabel, Pill, pillColorClass, ScopePill } from "../Pill";

describe("pillColorClass", () => {
  test("returns a deterministic color class for a given string", () => {
    const first = pillColorClass("test");
    const second = pillColorClass("test");
    expect(first).toBe(second);
  });

  test("returns different colors for different strings", () => {
    const a = pillColorClass("alpha");
    const b = pillColorClass("beta");
    expect(a).not.toBe(b);
  });
});

describe("Pill", () => {
  test("renders the name text", () => {
    render(<Pill name="Parquet" />);
    expect(screen.getByText("Parquet")).toBeInTheDocument();
  });

  test("applies deterministic color class", () => {
    render(<Pill name="CSV" />);
    const el = screen.getByText("CSV");
    expect(el.className).toContain(pillColorClass("CSV"));
  });

  test("merges custom className", () => {
    render(<Pill name="Tag" className="ml-2" />);
    const el = screen.getByText("Tag");
    expect(el.className).toContain("ml-2");
  });
});

describe("formatScopeLabel", () => {
  test("returns 'Personal' for empty string", () => {
    expect(formatScopeLabel("")).toBe("Personal");
  });

  test("returns 'Personal' for a UUID", () => {
    expect(formatScopeLabel("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "Personal",
    );
  });

  test("returns 'Personal' for uppercase UUID", () => {
    expect(formatScopeLabel("550E8400-E29B-41D4-A716-446655440000")).toBe(
      "Personal",
    );
  });

  test("returns last segment for a hierarchical path", () => {
    expect(formatScopeLabel("org/team/science")).toBe("science");
  });

  test("returns last segment for a single-segment path", () => {
    expect(formatScopeLabel("engineering")).toBe("engineering");
  });

  test("handles trailing slashes", () => {
    expect(formatScopeLabel("org/team/")).toBe("team");
  });

  test("handles leading slashes", () => {
    expect(formatScopeLabel("/org/team")).toBe("team");
  });

  test("returns the original string for a non-UUID, non-path value", () => {
    expect(formatScopeLabel("lab-alpha")).toBe("lab-alpha");
  });
});

describe("ScopePill", () => {
  test("renders 'Personal' for a UUID scope", () => {
    render(
      <ScopePill ownerScope="550e8400-e29b-41d4-a716-446655440000" />,
    );
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  test("renders last segment for a group scope", () => {
    render(<ScopePill ownerScope="org/research" />);
    expect(screen.getByText("research")).toBeInTheDocument();
  });

  test("applies custom className", () => {
    render(<ScopePill ownerScope="team" className="ml-4" />);
    const el = screen.getByText("team");
    expect(el.className).toContain("ml-4");
  });
});
