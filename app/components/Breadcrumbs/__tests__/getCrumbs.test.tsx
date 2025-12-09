import { ReactNode } from "react";
import { describe, expect, vi } from "vitest";

import { getCrumbs } from "../getCrumbs";

vi.mock("../BreadcrumbLink", () => ({
  default: ({
    children,
    to,
    className,
  }: {
    children: ReactNode;
    to: string;
    className: string;
  }) => (
    <a href={to} className={className} data-testid="breadcrumb-link">
      {children}
    </a>
  ),
}));

describe("getCrumbs", () => {
  test("returns the correct breadcrumb elements", () => {
    const segments = ["home", "documents", "reports"];
    const to = "/base";
    const crumbs = getCrumbs(to, segments);

    expect(crumbs).toHaveLength(3);
    expect(crumbs[0].props.to).toEqual("/base/home");
    expect(crumbs[1].props.to).toEqual("/base/home/documents");
    expect(crumbs[2].props.to).toEqual("/base/home/documents/reports");
  });
});
