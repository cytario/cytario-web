import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, test, vi } from "vitest";

import { ImageSidebarToggle } from "~/components/.client/ImageViewer/components/sidebar/ImageSidebarToggle";
import { useViewerSidebarStore } from "~/components/.client/ImageViewer/components/useViewerSidebarStore";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

vi.mock("@cytario/design", async () => {
  const actual = await vi.importActual<typeof import("@cytario/design")>("@cytario/design");
  return {
    ...actual,
    IconButton: ({
      id,
      label,
      icon,
      onPress,
      "aria-expanded": ariaExpanded,
      "aria-controls": ariaControls,
    }: {
      id?: string;
      label: string;
      icon: string;
      onPress?: () => void;
      "aria-expanded"?: boolean;
      "aria-controls"?: string;
    }) =>
      createElement(
        "button",
        {
          id,
          "data-testid": "image-controls-toggle",
          "data-icon": icon,
          "aria-expanded": ariaExpanded,
          "aria-controls": ariaControls,
          onClick: onPress,
        },
        label,
      ),
  };
});

describe("ImageSidebarToggle", () => {
  beforeEach(() => {
    useLayoutStore.setState({ headerSlot: null });
  });

  test("registers the toggle into the header slot and clears it on unmount", () => {
    const { unmount } = render(createElement(ImageSidebarToggle));
    expect(useLayoutStore.getState().headerSlot).not.toBeNull();

    unmount();
    expect(useLayoutStore.getState().headerSlot).toBeNull();
  });

  test("the header slot button carries the stable toggle id and reflects the open state", () => {
    useViewerSidebarStore.setState({ isOpen: true });
    render(createElement(ImageSidebarToggle));

    render(createElement("div", null, useLayoutStore.getState().headerSlot));
    const toggle = screen.getByTestId("image-controls-toggle");

    expect(toggle).toHaveAttribute("id", "image-controls-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", "image-controls-sidebar");
  });

  test("the header slot button toggles the viewer sidebar store", async () => {
    useViewerSidebarStore.setState({ isOpen: true });
    render(createElement(ImageSidebarToggle));
    render(createElement("div", null, useLayoutStore.getState().headerSlot));

    await userEvent.click(screen.getByTestId("image-controls-toggle"));

    expect(useViewerSidebarStore.getState().isOpen).toBe(false);
  });
});
