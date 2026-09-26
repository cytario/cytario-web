import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, test, vi } from "vitest";

import { HelpMenu } from "~/components/HelpMenu";
import { useTourControllerStore } from "~/components/Tour/useTourController";

vi.mock("@cytario/design", async () => {
  const actual = await vi.importActual<typeof import("@cytario/design")>("@cytario/design");
  return {
    ...actual,
    Menu: ({ content }: { content: React.ReactNode }) =>
      createElement("div", { "data-testid": "menu-content" }, content),
    MenuSeparator: () => createElement("hr", null),
    MenuSection: ({ header, children }: { header?: React.ReactNode; children: React.ReactNode }) =>
      createElement(
        "div",
        { "data-testid": "menu-section" },
        header ? createElement("div", { "data-testid": "menu-section-header" }, header) : null,
        children,
      ),
    IconButton: ({ icon, label }: { icon: string; label: string }) =>
      createElement("button", { "data-testid": "help-trigger", "data-icon": icon }, label),
    MenuItem: ({
      id,
      href,
      target,
      onAction,
      children,
    }: {
      id: string;
      href?: string;
      target?: string;
      onAction?: () => void;
      children: React.ReactNode;
    }) => {
      if (href) {
        return createElement("a", { id, href, target, "data-testid": `menu-item-${id}` }, children);
      }
      return createElement(
        "div",
        { id, "data-testid": `menu-item-${id}`, onClick: onAction },
        children,
      );
    },
  };
});

/**
 * HelpMenu reads the current route and the protected layout's connections, so
 * it needs a data router whose layout route supplies loader data. The stub
 * resolves its loaders asynchronously, hence the readiness wait.
 */
async function renderMenu(
  props: { version: string; docsUrl?: string; supportEmail?: string },
  path = "/",
  connectionCount = 0,
) {
  const Stub = createRoutesStub([
    {
      id: "routes/layouts/protected.layout",
      path: "/",
      loader: () => ({ connectionConfigs: Array.from({ length: connectionCount }) }),
      Component: () => <HelpMenu {...props} />,
    },
    { path: "/connections", Component: () => <HelpMenu {...props} /> },
    { path: "/connections/:id/*", Component: () => <HelpMenu {...props} /> },
  ]);

  render(<Stub initialEntries={[path]} />);
  await waitFor(() => expect(screen.queryByTestId("menu-content")).not.toBeNull());
}

describe("HelpMenu", () => {
  test("renders documentation and support links when both URLs are set", async () => {
    await renderMenu({
      version: "1.2.3",
      docsUrl: "https://docs.example.com",
      supportEmail: "support@example.com",
    });

    const docs = screen.getByTestId("menu-item-docs");
    expect(docs).toHaveAttribute("href", "https://docs.example.com");
    expect(docs).toHaveAttribute("target", "_blank");
    expect(docs).toHaveTextContent("Documentation");

    const support = screen.getByTestId("menu-item-support");
    expect(support).toHaveAttribute("href", "mailto:support@example.com");
    expect(support).toHaveTextContent("Contact Support");
  });

  test("omits the support entry when supportEmail is unset", async () => {
    await renderMenu({ version: "1.2.3", docsUrl: "https://docs.example.com" });

    expect(screen.queryByTestId("menu-item-support")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-item-docs")).toBeInTheDocument();
  });

  test("omits the documentation entry when docsUrl is unset", async () => {
    await renderMenu({ version: "1.2.3", supportEmail: "support@example.com" });

    expect(screen.queryByTestId("menu-item-docs")).not.toBeInTheDocument();
    expect(screen.getByTestId("menu-item-support")).toBeInTheDocument();
  });

  test("links the version entry to the config route", async () => {
    await renderMenu({ version: "1.2.3" });

    const version = screen.getByTestId("menu-item-version");
    expect(version).toHaveAttribute("href", "/config");
    expect(version).toHaveTextContent("Version 1.2.3");
  });

  test("groups the guided tours under a section header on every screen", async () => {
    await renderMenu({ version: "1.2.3" });

    expect(screen.getByTestId("menu-section-header")).toHaveTextContent("Guided tours");
    expect(screen.getByTestId("menu-item-tour-getting-started")).toHaveTextContent(
      "Getting started tour",
    );
  });

  test("requests the getting-started tour on activation", async () => {
    await renderMenu({ version: "1.2.3" });

    await userEvent.click(screen.getByTestId("menu-item-tour-getting-started"));
    expect(useTourControllerStore.getState().requestedTourId).toBe("getting-started");
    useTourControllerStore.getState().consumeRequest();
  });

  test("omits the viewer tour entry outside the image viewer", async () => {
    await renderMenu({ version: "1.2.3" }, "/connections");

    expect(screen.queryByTestId("menu-item-tour-viewer")).not.toBeInTheDocument();
  });

  test("offers the viewer tour entry while an image is open", async () => {
    await renderMenu({ version: "1.2.3" }, "/connections/abc/slide.ome.tiff");

    await userEvent.click(screen.getByTestId("menu-item-tour-viewer"));
    expect(useTourControllerStore.getState().requestedTourId).toBe("viewer");
    useTourControllerStore.getState().consumeRequest();
  });
});
