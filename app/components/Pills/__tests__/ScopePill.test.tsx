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
    expect(screen.getByLabelText("Path: cytario / Lab Services")).toBeInTheDocument();
    expect(screen.getByText("Lab Services")).toBeInTheDocument();
  });

  test("renders single-segment scope", () => {
    render(<ScopePill scope="cytario" />);
    expect(screen.getByText("cytario")).toBeInTheDocument();
  });

  test("renders deep scope path with all segments in aria-label", () => {
    render(<ScopePill scope="cytario/Lab Services/team-x" />);
    expect(screen.getByLabelText("Path: cytario / Lab Services / team-x")).toBeInTheDocument();
    expect(screen.getByText("team-x")).toBeInTheDocument();
  });

  test("respects visibleCount prop", () => {
    render(<ScopePill scope="cytario/Lab Services/team-x" visibleCount={1} />);
    expect(screen.getByText("team-x")).toBeInTheDocument();
    expect(screen.queryByText("cytario")).toBeNull();
  });

  test("shows last segment and full path in aria-label for admin scope", () => {
    render(<ScopePill scope="cytario/Lab Services/admins" />);
    expect(screen.getByLabelText("Path: cytario / Lab Services / admins")).toBeInTheDocument();
    expect(screen.getByText("admins")).toBeInTheDocument();
  });

  test("substitutes the `*` org-root sentinel with the organization identifier", () => {
    render(<ScopePill scope="*" organization="cytario" />);
    expect(screen.getByText("cytario")).toBeInTheDocument();
    expect(screen.queryByText("*")).toBeNull();
  });

  test("substitutes `*` inside a path while keeping other segments", () => {
    render(<ScopePill scope="*/admins" organization="cytario" />);
    expect(screen.getByLabelText("Path: cytario / admins")).toBeInTheDocument();
  });

  test("renders the raw `*` when no organization is supplied", () => {
    render(<ScopePill scope="*" />);
    expect(screen.getByText("*")).toBeInTheDocument();
  });
});
