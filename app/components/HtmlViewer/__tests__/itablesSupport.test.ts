import { describe, expect, test } from "vitest";

import { buildItablesPreshim, classicModuleScript, detectItablesInit } from "../itablesSupport";

// A miniature of itables 2.x's offline init cell — the exact shape the
// delivered Quarto reports carry (init_notebook_mode, connected=False).
const initScript = `function injectCSS(base64CSS) {
    const cssText = atob(base64CSS);
    const style = document.createElement('style');
    style.textContent = cssText;
    document.head.appendChild(style);
}

async function injectModule(base64JS) {
    const jsText = atob(base64JS);
    const blob = new Blob([jsText], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    const module = await import(url);
    URL.revokeObjectURL(url);
    return module;
}

if (!window._itables_2_9_1) {
    injectCSS("ZHQgY3Nz");
    window._itables_2_9_1 = injectModule("ZXYgYWE7IGV4cG9ydHt2YiBhcyBkZWZhdWx0fTs=");
    window._itables_2_9_1.then(() => {
        window.dispatchEvent(new Event("itables-2.9.1-ready"));
    });
}`;

describe("detectItablesInit", () => {
  test("matches the itables offline init cell and extracts version + payload", () => {
    const init = detectItablesInit(initScript);
    expect(init).not.toBeNull();
    expect(init!.version).toBe("2_9_1");
    expect(init!.bundleBase64).toBe("ZXYgYWE7IGV4cG9ydHt2YiBhcyBkZWZhdWx0fTs=");
  });

  test("ignores scripts without the init assignment", () => {
    expect(detectItablesInit("console.log('plain')")).toBeNull();
    // The injectModule helper alone, without the guarded assignment, is not
    // an init cell.
    expect(
      detectItablesInit(initScript.replace(/window\._itables_2_9_1 = injectModule\([^)]*\);/, "")),
    ).toBeNull();
  });

  test("ignores a non-literal bundle argument", () => {
    expect(
      detectItablesInit(
        initScript.replace(
          'injectModule("ZXYgYWE7IGV4cG9ydHt2YiBhcyBkZWZhdWx0fTs=")',
          "injectModule(someVariable)",
        ),
      ),
    ).toBeNull();
  });
});

describe("classicModuleScript", () => {
  test("rewrites a trailing export statement into an exports assignment", () => {
    const classic = classicModuleScript("var vb = 1;\nexport{vb as default};");
    expect(classic).toContain("window.__itables_module = {default: vb};");
    expect(classic).toContain("var vb = 1;");
    expect(classic).not.toContain("export");
  });

  test("handles renamed and multiple exports", () => {
    const classic = classicModuleScript(
      "const ITable = 1, jQuery = 2;\nexport{ITable, jQuery as $};",
    );
    expect(classic).toContain("ITable: ITable");
    expect(classic).toContain("$: jQuery");
  });

  test("rejects bundles that import or use import.meta", () => {
    expect(classicModuleScript('import x from "y";\nexport{x};')).toBeNull();
    expect(classicModuleScript("const u = import.meta.url;\nexport{u};")).toBeNull();
  });

  test("rejects a bundle without a trailing export statement", () => {
    expect(classicModuleScript("var x = 1;")).toBeNull();
  });
});

describe("buildItablesPreshim", () => {
  test("resolves the version promise and fires the dotted ready event", () => {
    const preshim = buildItablesPreshim("window.__itables_module = {default: 1};", "2_9_1");
    expect(preshim).toContain("window._itables_2_9_1 = Promise.resolve(window.__itables_module);");
    expect(preshim).toContain('new Event("itables-2.9.1-ready")');
  });
});
