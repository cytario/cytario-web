import { resetOverlayErrorReporting, shouldReportOverlayError } from "../overlayErrorOnce";

describe("overlayErrorOnce", () => {
  test("reports the first failure for a resource+config pair only", () => {
    expect(shouldReportOverlayError("res-1", "cfg-a")).toBe(true);
    expect(shouldReportOverlayError("res-1", "cfg-a")).toBe(false);
    expect(shouldReportOverlayError("res-1", "cfg-a")).toBe(false);
  });

  test("reports again after the config changes", () => {
    shouldReportOverlayError("res-1", "cfg-a");
    expect(shouldReportOverlayError("res-1", "cfg-b")).toBe(true);
    expect(shouldReportOverlayError("res-1", "cfg-b")).toBe(false);
  });

  test("keys suppression per resource", () => {
    shouldReportOverlayError("res-1", "cfg-a");
    expect(shouldReportOverlayError("res-2", "cfg-a")).toBe(true);
  });

  test("re-arms every config after an explicit reset without touching other resources", () => {
    shouldReportOverlayError("res-1", "cfg-a");
    const otherReported = shouldReportOverlayError("res-other", "cfg-a");
    resetOverlayErrorReporting("res-1");

    expect(shouldReportOverlayError("res-1", "cfg-a")).toBe(true);
    // the other resource's suppression survives res-1's reset
    expect(shouldReportOverlayError("res-other", "cfg-a")).toBe(false);
    expect(otherReported).toBe(true);
  });
});
