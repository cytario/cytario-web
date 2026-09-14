import type { SignedFetch } from "@cytario/plugin-api";
import { viewerRegistry } from "~/components/viewerRegistry";

const signedFetch: SignedFetch = async () => new Response();

describe("viewerRegistry", () => {
  beforeEach(() => {
    viewerRegistry.__reset();
  });

  test("appends contributions in registration order (multi-owner)", () => {
    const a = { match: () => false, component: () => null };
    const b = { match: () => false, component: () => null };
    viewerRegistry.scopedFor("plugin-a").register(a);
    viewerRegistry.scopedFor("plugin-b").register(b);

    expect(viewerRegistry.resolve("res")).toBeNull();
    expect(viewerRegistry.isEmpty()).toBe(false);
    expect(viewerRegistry.hasAsync()).toBe(false);
  });

  test("resolve returns the first sync match in registration order", () => {
    const first = { match: (id: string) => id.endsWith(".a"), component: () => null };
    const second = { match: (id: string) => id.endsWith(".b"), component: () => null };
    viewerRegistry.scopedFor("plugin-a").register(first);
    viewerRegistry.scopedFor("plugin-b").register(second);

    expect(viewerRegistry.resolve("x.a")).toBe(first);
    expect(viewerRegistry.resolve("x.b")).toBe(second);
    expect(viewerRegistry.resolve("x.zarr")).toBeNull();
  });

  test("resolveAsync returns the first canHandle that resolves true, in order", async () => {
    const sniffer = {
      match: () => false,
      component: () => null,
      canHandle: vi.fn().mockResolvedValue(false),
    };
    const winner = {
      match: () => false,
      component: () => null,
      canHandle: vi.fn().mockResolvedValue(true),
    };
    const neverAsked = {
      match: () => false,
      component: () => null,
      canHandle: vi.fn().mockResolvedValue(true),
    };
    viewerRegistry.scopedFor("a").register(sniffer);
    viewerRegistry.scopedFor("b").register(winner);
    viewerRegistry.scopedFor("c").register(neverAsked);

    await expect(viewerRegistry.resolveAsync("res", signedFetch)).resolves.toBe(winner);
    expect(neverAsked.canHandle).not.toHaveBeenCalled();
  });

  test("resolveAsync skips contributions without canHandle and returns null when none claim it", async () => {
    viewerRegistry.scopedFor("a").register({ match: () => false, component: () => null });
    const declined = {
      match: () => false,
      component: () => null,
      canHandle: vi.fn().mockResolvedValue(false),
    };
    viewerRegistry.scopedFor("b").register(declined);

    await expect(viewerRegistry.resolveAsync("res", signedFetch)).resolves.toBeNull();
    expect(declined.canHandle).toHaveBeenCalledWith("res", signedFetch);
  });

  test("resolveAsync treats a rejected canHandle as false", async () => {
    const failing = {
      match: () => false,
      component: () => null,
      canHandle: vi.fn().mockRejectedValue(new Error("sniff blew up")),
    };
    const fallback = {
      match: () => false,
      component: () => null,
      canHandle: vi.fn().mockResolvedValue(true),
    };
    viewerRegistry.scopedFor("a").register(failing);
    viewerRegistry.scopedFor("b").register(fallback);

    await expect(viewerRegistry.resolveAsync("res", signedFetch)).resolves.toBe(fallback);
  });

  test("hasAsync is true only when a contribution offers canHandle", () => {
    viewerRegistry.scopedFor("a").register({ match: () => true, component: () => null });
    expect(viewerRegistry.hasAsync()).toBe(false);

    viewerRegistry.scopedFor("b").register({
      match: () => false,
      component: () => null,
      canHandle: async () => true,
    });
    expect(viewerRegistry.hasAsync()).toBe(true);
  });

  test("rejects a non-function match", () => {
    expect(() =>
      viewerRegistry
        .scopedFor("bad-plugin")
        .register({ match: true as never, component: () => null }),
    ).toThrow(TypeError);
    expect(() =>
      viewerRegistry
        .scopedFor("bad-plugin")
        .register({ match: true as never, component: () => null }),
    ).toThrow(/bad-plugin/);
  });

  test("rejects a non-component", () => {
    expect(() =>
      viewerRegistry
        .scopedFor("bad-plugin")
        .register({ match: () => true, component: "not-a-component" }),
    ).toThrow(TypeError);
  });

  test("rejects a non-function canHandle", () => {
    expect(() =>
      viewerRegistry
        .scopedFor("bad-plugin")
        .register({ match: () => true, component: () => null, canHandle: "nope" as never }),
    ).toThrow(TypeError);
  });

  test("__reset drops all registrations", () => {
    viewerRegistry.scopedFor("a").register({ match: () => true, component: () => null });
    viewerRegistry.__reset();

    expect(viewerRegistry.isEmpty()).toBe(true);
    expect(viewerRegistry.hasAsync()).toBe(false);
    expect(viewerRegistry.resolve("res")).toBeNull();
  });
});
