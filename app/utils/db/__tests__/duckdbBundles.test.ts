import { getLocalDuckDbBundles } from "../duckdbBundles";

describe("getLocalDuckDbBundles", () => {
  test("returns absolute URLs in a browser-like environment", () => {
    const bundles = getLocalDuckDbBundles();

    // happy-dom provides `window.location` rooted at `http://localhost/`.
    expect(bundles.mvp?.mainModule).toMatch(/^https?:\/\//);
    expect(bundles.eh?.mainModule).toMatch(/^https?:\/\//);
    expect(bundles.coi?.mainModule).toMatch(/^https?:\/\//);
    expect(bundles.coi?.pthreadWorker).toMatch(/^https?:\/\//);
  });

  test("throws when invoked on the server (no window)", () => {
    // happy-dom installs `window` globally; remove it to simulate SSR.
    const originalWindow = globalThis.window;
    // @ts-expect-error — deliberately removing `window` to simulate SSR.
    delete globalThis.window;
    try {
      expect(() => getLocalDuckDbBundles()).toThrow(/SSR/i);
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
