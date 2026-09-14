import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { HelpMenu } from "~/components/HelpMenu";

vi.mock("lucide-react", async () => {
  const actual = await vi.importActual<typeof import("lucide-react")>("lucide-react");
  return {
    ...actual,
    CircleHelp: () => createElement("svg", { "data-testid": "icon-circle-help" }),
  };
});

vi.mock("@cytario/design", async () => {
  const actual = await vi.importActual<typeof import("@cytario/design")>("@cytario/design");
  return {
    ...actual,
    Menu: ({ content }: { content: React.ReactNode }) =>
      createElement("div", { "data-testid": "menu-content" }, content),
    MenuSeparator: () => createElement("hr", null),
    MenuItem: ({
      id,
      href,
      target,
      children,
    }: {
      id: string;
      href?: string;
      target?: string;
      children: React.ReactNode;
    }) => {
      if (href) {
        return createElement("a", { id, href, target, "data-testid": `menu-item-${id}` }, children);
      }
      return createElement("div", { id, "data-testid": `menu-item-${id}` }, children);
    },
  };
});

describe("HelpMenu", () => {
  test("renders documentation and support links when both URLs are set", () => {
    render(
      <HelpMenu
        version="1.2.3"
        docsUrl="https://docs.example.com"
        supportEmail="support@example.com"
      />,
    );

    const docs = screen.getByTestId("menu-item-docs");
    expect(docs).toHaveAttribute("href", "https://docs.example.com");
    expect(docs).toHaveAttribute("target", "_blank");
    expect(docs).toHaveTextContent("Documentation");

    const support = screen.getByTestId("menu-item-support");
    expect(support).toHaveAttribute("href", "mailto:support@example.com");
    expect(support).toHaveTextContent("Contact Support");
  });

  test("omits the support entry when supportEmail is unset", () => {
    render(<HelpMenu version="1.2.3" docsUrl="https://docs.example.com" />);

    expect(screen.queryByTestId("menu-item-support")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-item-docs")).toBeInTheDocument();
  });

  test("omits the documentation entry when docsUrl is unset", () => {
    render(<HelpMenu version="1.2.3" supportEmail="support@example.com" />);

    expect(screen.queryByTestId("menu-item-docs")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-item-support")).toBeInTheDocument();
  });

  test("links the version entry to the config route", () => {
    render(<HelpMenu version="1.2.3" />);

    const version = screen.getByTestId("menu-item-version");
    expect(version).toHaveAttribute("href", "/config");
    expect(version).toHaveTextContent("Version 1.2.3");
  });
});
