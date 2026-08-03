import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";

import { SidebarNavItem, sidebarNavItemClasses } from "../SidebarNavItem";

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNavItem to="/jobs">Jobs</SidebarNavItem>
    </MemoryRouter>,
  );

describe("sidebarNavItemClasses", () => {
  test("active state uses the accent surface + foreground pair", () => {
    expect(sidebarNavItemClasses({ isActive: true })).toBe("bg-accent text-accent-foreground");
  });

  test("inactive state uses muted foreground with hover affordance", () => {
    expect(sidebarNavItemClasses({ isActive: false })).toBe(
      "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
    );
  });
});

describe("SidebarNavItem", () => {
  test("renders a link with the row geometry and label", () => {
    renderAt("/other");
    const link = screen.getByRole("link", { name: "Jobs" });
    expect(link).toBeInTheDocument();
    expect(link.className).toContain("flex");
    expect(link.className).toContain("h-9");
    expect(link.className).toContain("rounded-md");
  });

  test("applies the active classes when the route matches", () => {
    renderAt("/jobs");
    const link = screen.getByRole("link", { name: "Jobs" });
    expect(link.className).toContain("bg-accent text-accent-foreground");
    expect(link.className).not.toContain("hover:bg-accent/50");
  });

  test("applies the inactive classes when the route does not match", () => {
    renderAt("/other");
    const link = screen.getByRole("link", { name: "Jobs" });
    expect(link.className).toContain("text-muted-foreground");
    expect(link.className).toContain("hover:bg-accent/50");
    expect(link.className).not.toContain("bg-accent text-accent-foreground");
  });

  test("renders an icon when one is provided", () => {
    render(
      <MemoryRouter>
        <SidebarNavItem to="/jobs" icon="Microscope">
          Jobs
        </SidebarNavItem>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /Jobs/ })).toBeInTheDocument();
  });

  test("caller className is merged, not overridden, by twMerge", () => {
    render(
      <MemoryRouter initialEntries={["/other"]}>
        <SidebarNavItem to="/jobs" className="px-4">
          Jobs
        </SidebarNavItem>
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: "Jobs" });
    expect(link.className).toContain("px-4");
    expect(link.className).not.toContain("px-2");
  });
});
