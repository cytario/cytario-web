import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { GroupPill } from "~/components/Pill/GroupPill";

describe("GroupPill", () => {
  describe("segment rendering", () => {
    test("renders single segment as text pill with no dots", () => {
      render(<GroupPill path="cytario" />);

      expect(screen.getByText("cytario")).toBeInTheDocument();
    });

    test("renders last segment as text, earlier segments as dots", () => {
      const { container } = render(<GroupPill path="cytario/lab/team-a" />);

      // Only the last segment is visible as text (visibleCount defaults to 1)
      expect(screen.getByText("team-a")).toBeInTheDocument();
      expect(screen.queryByText("cytario")).not.toBeInTheDocument();
      expect(screen.queryByText("lab")).not.toBeInTheDocument();

      // Two dot elements exist (for "cytario" and "lab")
      const dots = container.querySelectorAll(".rounded-full.absolute");
      expect(dots).toHaveLength(2);
    });

    test("respects visibleCount prop", () => {
      render(<GroupPill path="cytario/lab/team-a" visibleCount={2} />);

      // Last two segments visible as text
      expect(screen.getByText("lab")).toBeInTheDocument();
      expect(screen.getByText("team-a")).toBeInTheDocument();
      expect(screen.queryByText("cytario")).not.toBeInTheDocument();
    });

    test("shows all segments when visibleCount >= segment count", () => {
      const { container } = render(
        <GroupPill path="cytario/lab" visibleCount={3} />,
      );

      expect(screen.getByText("cytario")).toBeInTheDocument();
      expect(screen.getByText("lab")).toBeInTheDocument();

      // No dots
      const dots = container.querySelectorAll(".rounded-full.absolute");
      expect(dots).toHaveLength(0);
    });
  });

  describe("tooltip", () => {
    test("shows full path tooltip when dots are present", () => {
      const { container } = render(<GroupPill path="cytario/lab/team-a" />);

      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).toHaveAttribute("title", "cytario / lab / team-a");
    });

    test("does not show tooltip when all segments are visible", () => {
      const { container } = render(<GroupPill path="team-a" />);

      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).not.toHaveAttribute("title");
    });

    test("does not show tooltip when visibleCount covers all segments", () => {
      const { container } = render(
        <GroupPill path="cytario/lab" visibleCount={2} />,
      );

      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).not.toHaveAttribute("title");
    });
  });

  describe("color consistency", () => {
    test("same segment name always gets the same color class", () => {
      const { container: container1 } = render(<GroupPill path="team-a" />);
      const { container: container2 } = render(
        <GroupPill path="other/team-a" />,
      );

      // Both render "team-a" — get the color from the visible pill element
      const pill1 = container1.querySelector(
        ".rounded-full:not(.absolute)",
      ) as HTMLElement;
      const pill2 = container2.querySelector(
        ".rounded-full:not(.absolute)",
      ) as HTMLElement;

      expect(pill1.className).toBe(pill2.className);
    });
  });
});
