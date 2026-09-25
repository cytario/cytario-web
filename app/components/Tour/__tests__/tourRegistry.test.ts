import { describe, expect, test } from "vitest";

import {
  GETTING_STARTED_TOUR_ID,
  VIEWER_TOUR_ID,
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

    test("every step targets a selector", () => {
      for (const tour of tourRegistry) {
        for (const step of tour.steps) {
          expect(step.target).toBeTruthy();
        }
      }
    });
  });
});
