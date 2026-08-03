import { sidebarNavRegistry } from "~/components/sidebarNavRegistry";

const baseEntry = {
  id: "jobs",
  label: "Jobs",
  icon: "Microscope",
  to: "/jobs",
} as const;

describe("sidebarNavRegistry", () => {
  beforeEach(() => {
    sidebarNavRegistry.__reset();
  });

  test("appends entries in registration order (multi-owner)", () => {
    sidebarNavRegistry.scopedFor("plugin-a").register("nav", { ...baseEntry, id: "a" });
    sidebarNavRegistry.scopedFor("plugin-b").register("nav", { ...baseEntry, id: "b" });

    const records = sidebarNavRegistry.get("nav");
    expect(records.map((r) => r.pluginName)).toEqual(["plugin-a", "plugin-b"]);
    expect(records.map((r) => r.entry.id)).toEqual(["a", "b"]);
  });

  test("rejects a duplicate (target, id) within a single plugin", () => {
    sidebarNavRegistry.scopedFor("plugin-a").register("nav", { ...baseEntry, id: "jobs" });
    expect(() =>
      sidebarNavRegistry.scopedFor("plugin-a").register("nav", { ...baseEntry, id: "jobs" }),
    ).toThrow(/duplicate sidebar-nav entry id/);
  });

  test("tolerates the same id across different plugins", () => {
    sidebarNavRegistry.scopedFor("plugin-a").register("nav", { ...baseEntry, id: "jobs" });
    expect(() =>
      sidebarNavRegistry.scopedFor("plugin-b").register("nav", { ...baseEntry, id: "jobs" }),
    ).not.toThrow();
    expect(sidebarNavRegistry.get("nav")).toHaveLength(2);
  });

  test("rejects an entry with a missing or empty id", () => {
    expect(() =>
      sidebarNavRegistry.scopedFor("plugin-a").register("nav", {
        ...baseEntry,
        id: "",
      } as never),
    ).toThrow(/missing or empty id/);
  });

  test("rejects an entry with a missing or empty to", () => {
    expect(() =>
      sidebarNavRegistry.scopedFor("plugin-a").register("nav", {
        ...baseEntry,
        to: "",
      } as never),
    ).toThrow(/missing or empty to/);
  });

  test("rejects an entry with a non-function isHidden", () => {
    expect(() =>
      sidebarNavRegistry.scopedFor("plugin-a").register("nav", {
        ...baseEntry,
        isHidden: "not-a-function" as never,
      }),
    ).toThrow(/non-function isHidden/);
  });

  test("rejects an entry with a non-function onActivate", () => {
    expect(() =>
      sidebarNavRegistry.scopedFor("plugin-a").register("nav", {
        ...baseEntry,
        onActivate: "not-a-function" as never,
      }),
    ).toThrow(/non-function onActivate/);
  });

  test("__reset drops all registrations", () => {
    sidebarNavRegistry.scopedFor("plugin-a").register("nav", { ...baseEntry, id: "a" });
    sidebarNavRegistry.__reset();
    expect(sidebarNavRegistry.get("nav")).toEqual([]);
  });
});
