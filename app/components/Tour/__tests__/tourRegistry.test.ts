import { describe, expect, test } from "vitest";

import {
  GETTING_STARTED_TOUR_ID,
  VIEWER_TOUR_ID,
  isImageViewerRoute,
  isResourcePath,
  leafNameOf,
} from "../tourRegistry";
import { tourRegistry } from "../tours/registry";

const gettingStarted = tourRegistry.find((tour) => tour.id === GETTING_STARTED_TOUR_ID)!;
const viewer = tourRegistry.find((tour) => tour.id === VIEWER_TOUR_ID)!;

describe("tourRegistry", () => {
  describe("getting-started shouldAutoStart", () => {
    test("starts with at least one connection", () => {
      expect(
        gettingStarted.shouldAutoStart({ pathname: "/", leafName: "", connectionCount: 1 }),
      ).toBe(true);
    });

    test("does not start without connections", () => {
      expect(
        gettingStarted.shouldAutoStart({ pathname: "/", leafName: "", connectionCount: 0 }),
      ).toBe(false);
    });

    test("does not depend on the route", () => {
      expect(
        gettingStarted.shouldAutoStart({
          pathname: "/connections/abc/folder",
          leafName: "folder",
          connectionCount: 3,
        }),
      ).toBe(true);
    });

    test("does not claim a single-file image route — the viewer tour owns it", () => {
      expect(
        gettingStarted.shouldAutoStart({
          pathname: "/connections/abc/slide.ome.tiff",
          leafName: "slide.ome.tiff",
          connectionCount: 3,
        }),
      ).toBe(false);
    });

    test("still runs on a non-image resource route", () => {
      expect(
        gettingStarted.shouldAutoStart({
          pathname: "/connections/abc/notes.txt",
          leafName: "notes.txt",
          connectionCount: 1,
        }),
      ).toBe(true);
    });

    test("exactly one tour claims a viewer image route", () => {
      const context = {
        pathname: "/connections/abc/slide.ome.tiff",
        leafName: "slide.ome.tiff",
        connectionCount: 1,
      };
      const claiming = tourRegistry.filter((tour) => tour.shouldAutoStart(context));
      expect(claiming.map((tour) => tour.id)).toEqual([VIEWER_TOUR_ID]);
    });
  });

  describe("viewer shouldAutoStart", () => {
    test("starts on a single-file image route", () => {
      expect(
        viewer.shouldAutoStart({
          pathname: "/connections/abc/slide.ome.tiff",
          leafName: "slide.ome.tiff",
          connectionCount: 1,
        }),
      ).toBe(true);
    });

    test("does not start on a directory route", () => {
      expect(
        viewer.shouldAutoStart({
          pathname: "/connections/abc/folder",
          leafName: "folder",
          connectionCount: 1,
        }),
      ).toBe(false);
    });

    test("does not start on a non-image file", () => {
      expect(
        viewer.shouldAutoStart({
          pathname: "/connections/abc/notes.txt",
          leafName: "notes.txt",
          connectionCount: 1,
        }),
      ).toBe(false);
    });

    test("does not start on the connections index", () => {
      expect(
        viewer.shouldAutoStart({ pathname: "/connections", leafName: "", connectionCount: 1 }),
      ).toBe(false);
    });
  });

  describe("replay availability", () => {
    const appScreen = { pathname: "/", leafName: "", connectionCount: 0 };
    const viewerScreen = {
      pathname: "/connections/abc/slide.ome.tiff",
      leafName: "slide.ome.tiff",
      connectionCount: 1,
    };

    test("the getting-started tour is replayable on every screen", () => {
      expect(gettingStarted.isAvailable(appScreen)).toBe(true);
      expect(gettingStarted.isAvailable(viewerScreen)).toBe(true);
      // Even with no connections, where it cannot auto-start.
      expect(gettingStarted.shouldAutoStart(appScreen)).toBe(false);
      expect(gettingStarted.isAvailable(appScreen)).toBe(true);
    });

    test("the viewer tour is replayable only while an image is open", () => {
      expect(viewer.isAvailable(viewerScreen)).toBe(true);
      expect(viewer.isAvailable(appScreen)).toBe(false);
      expect(
        viewer.isAvailable({ pathname: "/connections/abc", leafName: "abc", connectionCount: 1 }),
      ).toBe(false);
    });

    test("every tour carries a distinct menu label", () => {
      const labels = tourRegistry.map((tour) => tour.menuLabel);
      expect(labels.every((label) => label.length > 0)).toBe(true);
      expect(new Set(labels).size).toBe(labels.length);
    });
  });

  describe("helpers", () => {
    test("isResourcePath matches nested resource routes", () => {
      expect(isResourcePath("/connections/abc/folder/img.tiff")).toBe(true);
      expect(isResourcePath("/connections/abc")).toBe(false);
      expect(isResourcePath("/connections")).toBe(false);
    });

    test("leafNameOf returns the decoded last segment", () => {
      expect(leafNameOf("/connections/abc/some%20dir/image.svs")).toBe(
        "some dir/image.svs".split("/").pop(),
      );
      expect(leafNameOf("/connections")).toBe("connections");
    });

    test("isImageViewerRoute is true only for a single-file image", () => {
      expect(isImageViewerRoute("/connections/abc/slide.ome.tiff", "slide.ome.tiff")).toBe(true);
      expect(isImageViewerRoute("/connections/abc/notes.txt", "notes.txt")).toBe(false);
      expect(isImageViewerRoute("/connections/abc", "abc")).toBe(false);
      expect(isImageViewerRoute("/connections", "connections")).toBe(false);
    });

    test("every step targets a selector", () => {
      for (const tour of tourRegistry) {
        for (const step of tour.steps) {
          expect(step.target).toBeTruthy();
        }
      }
    });
  });
});
