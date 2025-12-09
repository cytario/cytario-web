import { ViewState } from "../../../state/types";
import { calculateViewStateToFit } from "../calculateViewStateToFit";
import mock from "~/utils/__tests__/__mocks__";

const mockMetadata = mock.metadata({
  Pixels: mock.pixels({
    SizeX: 1000,
    SizeY: 500,
    PhysicalSizeX: 0.5,
    PhysicalSizeY: 0.5,
  }),
});

describe("calculateViewStateToFit", () => {
  test.each([
    {
      description: "calculates correct ViewState with default padding",
      metadata: mockMetadata,
      viewport: { width: 800, height: 600 },
      options: { padding: 48 },
      expected: {
        target: [500, 250],
        zoomScale: (800 - 96) / 1000, // Default padding = 48px
      },
    },
    {
      description: "calculates correct ViewState with custom padding",
      metadata: mockMetadata,
      viewport: { width: 800, height: 600 },
      options: { padding: 100 },
      expected: {
        target: [500, 250],
        zoomScale: Math.min((800 - 200) / 1000, (600 - 200) / 500), // Adjusted dimensions
      },
    },
    {
      description: "handles viewport smaller than padding gracefully",
      metadata: mockMetadata,
      viewport: { width: 80, height: 80 },
      options: { padding: 48 },
      expected: {
        target: [500, 250],
        zoomScale: 1 / 1000, // Adjusted dimensions are at least 1
      },
    },
    {
      description: "handles zero padding",
      metadata: mockMetadata,
      viewport: { width: 800, height: 600 },
      options: { padding: 0 },
      expected: {
        target: [500, 250],
        zoomScale: Math.min(800 / 1000, 600 / 500),
      },
    },
    {
      description: "centers the target on the image",
      metadata: mockMetadata,
      viewport: { width: 1000, height: 1000 },
      options: { padding: 48 },
      expected: {
        target: [500, 250],
        zoomScale: Math.min((1000 - 96) / 1000, (1000 - 96) / 500),
      },
    },
  ])("$description", ({ metadata, viewport, options, expected }) => {
    const result: ViewState = calculateViewStateToFit(
      metadata,
      viewport,
      options
    );

    expect(result.width).toBe(viewport.width);
    expect(result.height).toBe(viewport.height);
    expect(result.target).toEqual(expected.target);
    expect(result.zoom).toBeCloseTo(Math.log2(expected.zoomScale), 4);
  });

  test.each([
    {
      description: "handles wide image aspect ratio",
      metadata: mock.metadata({
        Pixels: mock.pixels({
          SizeX: 2000,
          SizeY: 200,
          PhysicalSizeX: 1,
          PhysicalSizeY: 1,
        }),
      }),
      viewport: { width: 1000, height: 500 },
      options: { padding: 48 },
      expectedZoomScale: (1000 - 96) / 2000, // Fit by width
    },
    {
      description: "handles tall image aspect ratio",
      metadata: mock.metadata({
        Pixels: mock.pixels({
          SizeX: 200,
          SizeY: 2000,
          PhysicalSizeX: 1,
          PhysicalSizeY: 1,
        }),
      }),
      viewport: { width: 500, height: 1000 },
      options: { padding: 48 },
      expectedZoomScale: (1000 - 96) / 2000, // Fit by height
    },
  ])("$description", ({ metadata, viewport, options, expectedZoomScale }) => {
    const result = calculateViewStateToFit(metadata, viewport, options);

    expect(result.zoom).toBeCloseTo(Math.log2(expectedZoomScale), 4);
    expect(result.target).toEqual([
      metadata.Pixels.SizeX / 2,
      metadata.Pixels.SizeY / 2,
    ]);
  });
});
