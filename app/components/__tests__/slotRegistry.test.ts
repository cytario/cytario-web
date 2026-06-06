import { slotRegistry } from "~/components/slotRegistry";

describe("slotRegistry", () => {
  beforeEach(() => {
    slotRegistry.__reset();
  });

  test("appends components in registration order (multi-owner)", () => {
    const a = () => null;
    const b = () => null;
    slotRegistry.register("app-banner", a);
    slotRegistry.register("app-banner", b);

    expect(slotRegistry.get("app-banner")).toEqual([a, b]);
  });

  test("never replaces — repeated registers accumulate", () => {
    const a = () => null;
    slotRegistry.register("app-overlay", a);
    slotRegistry.register("app-overlay", a);

    expect(slotRegistry.get("app-overlay")).toHaveLength(2);
  });

  test("keeps slots independent", () => {
    const overlay = () => null;
    const banner = () => null;
    slotRegistry.register("app-overlay", overlay);
    slotRegistry.register("app-banner", banner);

    expect(slotRegistry.get("app-overlay")).toEqual([overlay]);
    expect(slotRegistry.get("app-banner")).toEqual([banner]);
  });

  test("__reset drops all registrations", () => {
    slotRegistry.register("app-overlay", () => null);
    slotRegistry.__reset();

    expect(slotRegistry.get("app-overlay")).toEqual([]);
    expect(slotRegistry.get("app-banner")).toEqual([]);
  });
});
