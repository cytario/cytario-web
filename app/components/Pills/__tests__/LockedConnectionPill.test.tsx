import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { LockedConnectionPill, LOCKED_CONNECTION_NOTE } from "../LockedConnectionPill";

vi.mock("@cytario/design", () => ({
  Badge: ({ children, ...rest }: { children?: React.ReactNode }) => (
    <span {...rest}>{children}</span>
  ),
  Link: ({ children, href }: { children?: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

describe("LockedConnectionPill", () => {
  test("a lock with no call to action keeps the plain badge", () => {
    render(<LockedConnectionPill locked={{ id: "conn-1" }} />);

    expect(screen.getByText("Locked")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  test("the pill states the gate's own message, not the host's fallback", () => {
    render(
      <LockedConnectionPill
        locked={{ id: "conn-1", message: "Upgrade plan to browse private data." }}
      />,
    );

    expect(screen.getByText("Locked")).toHaveAccessibleName("Upgrade plan to browse private data.");
    expect(screen.queryByText(LOCKED_CONNECTION_NOTE)).not.toBeInTheDocument();
  });

  test("a call to action renders as a link beside the badge", () => {
    render(
      <LockedConnectionPill
        locked={{
          id: "conn-1",
          message: "Upgrade plan to browse private data.",
          resolveUrl: "https://admin.cytario.com/billing",
          resolveLabel: "Upgrade plan",
        }}
      />,
    );

    expect(screen.getByText("Locked")).toHaveAccessibleName("Upgrade plan to browse private data.");
    expect(screen.getByRole("link", { name: "Upgrade plan" })).toHaveAttribute(
      "href",
      "https://admin.cytario.com/billing",
    );
  });

  test("a call to action without a label still renders a usable link", () => {
    render(
      <LockedConnectionPill
        locked={{ id: "conn-1", resolveUrl: "https://admin.cytario.com/billing" }}
      />,
    );

    expect(screen.getByRole("link", { name: "Upgrade" })).toBeInTheDocument();
  });

  test("no locked data at all falls back to the host's generic note", () => {
    render(<LockedConnectionPill />);

    expect(screen.getByText("Locked")).toHaveAccessibleName(LOCKED_CONNECTION_NOTE);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
