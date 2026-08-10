import { contextMenuRegistry } from "~/components/contextMenuRegistry";

const baseEntry = {
  id: "analyze",
  label: "Analyze…",
  icon: "Microscope",
  onActivate: () => {},
} as const;

describe("contextMenuRegistry", () => {
  beforeEach(() => {
    contextMenuRegistry.__reset();
  });

  test("appends entries in registration order (multi-owner)", () => {
    contextMenuRegistry.scopedFor("plugin-a").register("s3-node", { ...baseEntry, id: "a" });
    contextMenuRegistry.scopedFor("plugin-b").register("s3-node", { ...baseEntry, id: "b" });

    const records = contextMenuRegistry.get("s3-node");
    expect(records.map((r) => r.pluginName)).toEqual(["plugin-a", "plugin-b"]);
    expect(records.map((r) => r.entry.id)).toEqual(["a", "b"]);
  });

  test("rejects a duplicate (target, id) within a single plugin", () => {
    contextMenuRegistry.scopedFor("plugin-a").register("s3-node", { ...baseEntry, id: "analyze" });
    expect(() =>
      contextMenuRegistry
        .scopedFor("plugin-a")
        .register("s3-node", { ...baseEntry, id: "analyze" }),
    ).toThrow(/duplicate context-menu entry id/);
  });

  test("tolerates the same id across different plugins", () => {
    contextMenuRegistry.scopedFor("plugin-a").register("s3-node", { ...baseEntry, id: "analyze" });
    expect(() =>
      contextMenuRegistry
        .scopedFor("plugin-b")
        .register("s3-node", { ...baseEntry, id: "analyze" }),
    ).not.toThrow();
    expect(contextMenuRegistry.get("s3-node")).toHaveLength(2);
  });

  test("rejects an entry with a missing or empty id", () => {
    expect(() =>
      contextMenuRegistry.scopedFor("plugin-a").register("s3-node", {
        ...baseEntry,
        id: "",
      } as never),
    ).toThrow(/missing or empty id/);
  });

  test("rejects an entry with a non-function onActivate", () => {
    expect(() =>
      contextMenuRegistry.scopedFor("plugin-a").register("s3-node", {
        ...baseEntry,
        onActivate: "not-a-function" as never,
      }),
    ).toThrow(/non-function onActivate/);
  });

  test("rejects an entry with a non-function isHidden", () => {
    expect(() =>
      contextMenuRegistry.scopedFor("plugin-a").register("s3-node", {
        ...baseEntry,
        isHidden: "not-a-function" as never,
      }),
    ).toThrow(/non-function isHidden/);
  });

  test("__reset drops all registrations", () => {
    contextMenuRegistry.scopedFor("plugin-a").register("s3-node", { ...baseEntry, id: "a" });
    contextMenuRegistry.__reset();
    expect(contextMenuRegistry.get("s3-node")).toEqual([]);
  });
});
