import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { ScopePill } from "../ScopePill";

describe("ScopePill", () => {
  test("renders 'Personal' pill for UUID scope", () => {
    render(<ScopePill scope="4cd912ea-5136-4b2d-8959-d5e983cbea05" />);
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  test("renders 'Personal' pill for empty scope", () => {
    render(<ScopePill scope="" />);
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  test("renders PathPill for group scope", () => {
    render(<ScopePill scope="cytario/Lab Services" />);
    expect(
      screen.getByLabelText("Path: cytario / Lab Services"),
    ).toBeInTheDocument();
    expect(screen.getByText("cytario")).toBeInTheDocument();
    expect(screen.getByText("Lab Services")).toBeInTheDocument();
  });

  test("renders single-segment scope", () => {
    render(<ScopePill scope="cytario" />);
    expect(screen.getByText("cytario")).toBeInTheDocument();
  });

  test("renders deep scope path with all segments", () => {
    render(<ScopePill scope="cytario/Lab Services/team-x" />);
    expect(
      screen.getByLabelText("Path: cytario / Lab Services / team-x"),
    ).toBeInTheDocument();
    expect(screen.getByText("cytario")).toBeInTheDocument();
    expect(screen.getByText("Lab Services")).toBeInTheDocument();
    expect(screen.getByText("team-x")).toBeInTheDocument();
  });

  test("respects visibleCount prop", () => {
    render(<ScopePill scope="cytario/Lab Services/team-x" visibleCount={1} />);
    expect(screen.getByText("team-x")).toBeInTheDocument();
    expect(screen.queryByText("cytario")).toBeNull();
  });

  test("renders Shield icon for admin scope", () => {
    const { container } = render(
      <ScopePill scope="cytario/Lab Services/admins" />,
    );
    expect(container.querySelector(".lucide-shield")).toBeInTheDocument();
    expect(container.querySelector(".lucide-users")).not.toBeInTheDocument();
  });

  test("strips /admins segment from display but keeps path", () => {
    render(<ScopePill scope="cytario/Lab Services/admins" />);
    expect(
      screen.getByLabelText("Path: cytario / Lab Services"),
    ).toBeInTheDocument();
    expect(screen.getByText("cytario")).toBeInTheDocument();
    expect(screen.getByText("Lab Services")).toBeInTheDocument();
    expect(screen.queryByText("admins")).not.toBeInTheDocument();
  });

  test("renders Users icon for non-admin scope", () => {
    const { container } = render(<ScopePill scope="cytario/Lab Services" />);
    expect(container.querySelector(".lucide-users")).toBeInTheDocument();
    expect(container.querySelector(".lucide-shield")).not.toBeInTheDocument();
  });

  test("renders no icon for Personal scope", () => {
    const { container } = render(<ScopePill scope="" />);
    expect(container.querySelector(".lucide-shield")).not.toBeInTheDocument();
    expect(container.querySelector(".lucide-users")).not.toBeInTheDocument();
  });
});
