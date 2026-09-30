import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("~/utils/connectionsStore/selectors", () => ({
  resolveResourceId: (resourceId: string) => ({
    connectionId: "c1",
    pathName: resourceId.slice(resourceId.indexOf("/") + 1),
    httpsUrl: `https://mock-bucket.s3.eu-central-1.amazonaws.com/${resourceId.slice(resourceId.indexOf("/") + 1)}`,
  }),
}));

import {
  loadReportDocument,
  MAX_ASSET_BYTES,
  MAX_ASSET_COUNT,
  MAX_HTML_BYTES,
  resolveObjectKey,
} from "../loadReport";
import type { SignedFetch } from "~/utils/signedFetch";

type Route = { pattern: RegExp; body: () => string; contentType?: string; length?: number };

function makeSignedFetch(routes: Route[]): SignedFetch {
  return (async (url: string) => {
    for (const route of routes) {
      if (route.pattern.test(url)) {
        const body = route.body();
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": route.contentType ?? "text/plain",
            ...(route.length !== undefined ? { "content-length": String(route.length) } : {}),
          },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  }) as SignedFetch;
}

const entry = "reports/analysis/report.html";

describe("resolveObjectKey", () => {
  test("resolves sibling refs relative to the entry key", () => {
    expect(resolveObjectKey(entry, "report_files/libs/plotly/plotly.js")).toBe(
      "reports/analysis/report_files/libs/plotly/plotly.js",
    );
  });

  test("resolves ../ refs one level up", () => {
    expect(resolveObjectKey(entry, "../shared/logo.png")).toBe("reports/shared/logo.png");
  });

  test("leaves absolute URLs, data URIs, fragments, and javascript: alone", () => {
    expect(resolveObjectKey(entry, "https://cdn.example.com/lib.js")).toBeNull();
    expect(resolveObjectKey(entry, "//cdn.example.com/lib.js")).toBeNull();
    expect(resolveObjectKey(entry, "data:image/png;base64,AAAA")).toBeNull();
    expect(resolveObjectKey(entry, "#section")).toBeNull();
    expect(resolveObjectKey(entry, "javascript:alert(1)")).toBeNull();
  });
});

describe("loadReportDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("inlines scripts, stylesheets, and images into one document", async () => {
    const html = `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="report_files/styles.css">
      </head><body>
      <img src="report_files/figure.png">
      <script src="report_files/app.js"></script>
      </body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
      {
        pattern: /styles\.css$/,
        body: () => "body { background: url('bg.png'); }",
        contentType: "text/css",
      },
      { pattern: /bg\.png$/, body: () => "PNGDATA", contentType: "image/png" },
      { pattern: /figure\.png$/, body: () => "FIGURE", contentType: "image/png" },
      { pattern: /app\.js$/, body: () => "console.log('ok');", contentType: "text/javascript" },
    ]);

    const result = await loadReportDocument("c1/reports/analysis/report.html", fetchImpl);

    expect(result).toContain('<style>body { background: url("data:image/png');
    expect(result).toContain('src="data:image/png');
    expect(result).not.toContain('src="report_files');
    expect(result).toContain("console.log('ok');");
    expect(result).not.toContain("<script src=");
    expect(result).not.toContain("<link");
  });

  test("resolves url() refs inside a linked stylesheet against the stylesheet's own directory", async () => {
    // The stylesheet lives at site_libs/bootstrap/ and references a font in
    // site_libs/bootstrap/fonts/. Relative to the entry document the ref
    // would wrongly resolve to site_libs/bootstrap/fonts under the entry's
    // directory only by coincidence — the ../-style depth change is the
    // discriminating case.
    const html = `<html><head><link rel="stylesheet" href="report_files/site_libs/bootstrap/bootstrap.min.css"></head><body></body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
      {
        pattern: /bootstrap\.min\.css$/,
        body: () => "@font-face { src: url('fonts/glyphicons.woff2'); }",
        contentType: "text/css",
      },
      {
        pattern: /site_libs\/bootstrap\/fonts\/glyphicons\.woff2$/,
        body: () => "WOFF2",
        contentType: "font/woff2",
      },
    ]);

    const result = await loadReportDocument("c1/reports/analysis/report.html", fetchImpl);

    expect(result).toContain('url("data:font/woff2;base64');
  });

  test("drops references to missing assets instead of failing", async () => {
    const html = `<html><body><img src="report_files/missing.png"><script src="report_files/missing.js"></script><link rel="stylesheet" href="report_files/missing.css"></body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
    ]);

    const result = await loadReportDocument("c1/reports/analysis/report.html", fetchImpl);

    expect(result).toContain('src="report_files/missing.png"');
    expect(result).not.toContain("missing.js");
    expect(result).not.toContain("missing.css");
  });

  test("surfaces a size error when the entry document exceeds the cap", async () => {
    const big = `<html><body>${"x".repeat(MAX_HTML_BYTES + 1)}</body></html>`;
    const fetchImpl = makeSignedFetch([
      {
        pattern: /report\.html$/,
        body: () => big,
        contentType: "text/html",
        length: big.length,
      },
    ]);

    await expect(loadReportDocument("c1/reports/analysis/report.html", fetchImpl)).rejects.toThrow(
      /preview limit/,
    );
  });

  test("surfaces a size error when an asset exceeds the per-asset cap", async () => {
    const html = `<html><body><script src="report_files/huge.js"></script></body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
      {
        pattern: /huge\.js$/,
        body: () => "x",
        contentType: "text/javascript",
        length: MAX_ASSET_BYTES + 1,
      },
    ]);

    await expect(loadReportDocument("c1/reports/analysis/report.html", fetchImpl)).rejects.toThrow(
      /preview limit/,
    );
  });

  test("surfaces a size error when the asset count exceeds the cap", async () => {
    const scripts = Array.from(
      { length: MAX_ASSET_COUNT + 1 },
      (_, i) => `<script src="report_files/s${i}.js"></script>`,
    ).join("");
    const html = `<html><body>${scripts}</body></html>`;
    const routes: Route[] = [
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
      ...Array.from({ length: MAX_ASSET_COUNT + 1 }, (_, i) => ({
        pattern: new RegExp(`s${i}\\.js$`),
        body: () => "x",
        contentType: "text/javascript",
      })),
    ];

    await expect(
      loadReportDocument("c1/reports/analysis/report.html", makeSignedFetch(routes)),
    ).rejects.toThrow(/preview limit/);
  });

  test("rejects a non-OK entry response with the HTTP status", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 403 })) as SignedFetch;

    await expect(loadReportDocument("c1/reports/analysis/report.html", fetchImpl)).rejects.toThrow(
      "HTTP 403 loading report",
    );
  });

  test("inlines srcset candidates and keeps descriptors", async () => {
    const html = `<html><body><img srcset="report_files/a.png 1x, report_files/b.png 2x"></body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
      { pattern: /a\.png$/, body: () => "AAA", contentType: "image/png" },
      { pattern: /b\.png$/, body: () => "BBB", contentType: "image/png" },
    ]);

    const result = await loadReportDocument("c1/reports/analysis/report.html", fetchImpl);

    expect(result).toMatch(/data:image\/png;base64,.* 1x, data:image\/png;base64,.* 2x/);
  });

  test("inline style attributes get url() refs inlined", async () => {
    const html = `<html><body><div style="background: url('report_files/bg.png')"></div></body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
      { pattern: /bg\.png$/, body: () => "BG", contentType: "image/png" },
    ]);

    const result = await loadReportDocument("c1/reports/analysis/report.html", fetchImpl);

    expect(result).toContain("url(&quot;data:image/png"); // attribute-encoded
  });

  test("external absolute URLs are left untouched", async () => {
    const html = `<html><head><script src="https://cdn.example.com/lib.js"></script></head><body></body></html>`;
    const fetchImpl = makeSignedFetch([
      { pattern: /report\.html$/, body: () => html, contentType: "text/html" },
    ]);

    const result = await loadReportDocument("c1/reports/analysis/report.html", fetchImpl);

    expect(result).toContain("https://cdn.example.com/lib.js");
  });
});
