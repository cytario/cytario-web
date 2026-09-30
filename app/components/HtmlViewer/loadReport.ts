import { resolveResourceId } from "~/utils/connectionsStore/selectors";
import type { SignedFetch } from "~/utils/signedFetch";

/** Entry document cap — the HTML itself must stay small; assets have their own caps. */
export const MAX_HTML_BYTES = 50 * 1024 * 1024;
/** Per-asset cap (images, scripts, stylesheets, fonts, media). */
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
/** Combined cap across the entry document and every fetched asset. */
export const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
/** Guards a pathological document (hundreds of thousands of refs) from OOMing the tab. */
export const MAX_ASSET_COUNT = 500;

interface ReportSizeError extends Error {
  readonly code: "report-too-large";
}

export function isReportSizeError(error: unknown): error is ReportSizeError {
  return error instanceof Error && (error as ReportSizeError).code === "report-too-large";
}

function reportTooLarge(detail: string): ReportSizeError {
  const error = new Error(`Report exceeds the preview limit (${detail})`);
  Object.defineProperty(error, "code", { value: "report-too-large" });
  return error as ReportSizeError;
}

async function readText(response: Response): Promise<string> {
  return new TextDecoder("utf-8").decode(await response.arrayBuffer());
}

/**
 * Resolve a relative ref against the entry object key and reject anything that
 * cannot be an object key. Returns `null` for refs that are never fetched:
 * absolute URLs, protocol-relative URLs, data URIs, fragments, and
 * `javascript:` — those are left untouched in the document (the host CSP
 * governs them at runtime). The STS session policy scopes signed reads to the
 * connection prefix already; prefix-stripping here is defense in depth.
 */
export function resolveObjectKey(entryKey: string, ref: string): string | null {
  if (ref === "") return null;
  if (ref.startsWith("data:")) return null;
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("//")) return null;
  if (ref.startsWith("#")) return null;
  if (ref.startsWith("javascript:")) return null;

  const directory = entryKey.split("/").slice(0, -1);
  const resolved = [...directory];
  for (const segment of ref.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  if (resolved.length === 0) return null;
  return resolved.join("/");
}

function toDataUri(bytes: Uint8Array, contentType: string | null): string {
  const mime = contentType && /^[\w.+-]+\/[\w.+-]+$/.test(contentType) ? contentType : "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mime || "application/octet-stream"};base64,${btoa(binary)}`;
}

interface DataUriAsset {
  bytes: Uint8Array;
  contentType: string | null;
}

/**
 * Parses a `data:[<mime>][;base64],<payload>` URI. Returns null for anything
 * else. Self-contained exports (Quarto `embed-resources`) carry stylesheets
 * and scripts as data URIs — the host CSP has no `data:` in style-src/script-src,
 * so those must be decoded and inlined as element bodies before render.
 */
function parseDataUri(ref: string): DataUriAsset | null {
  if (!ref.startsWith("data:")) return null;
  const commaIndex = ref.indexOf(",");
  if (commaIndex === -1) return null;
  const meta = ref.slice(5, commaIndex);
  const payload = ref.slice(commaIndex + 1);
  const isBase64 = /;base64$/i.test(meta);
  const contentType = meta.split(";")[0] || null;
  try {
    if (isBase64) {
      const binary = atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return { bytes, contentType };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), contentType };
  } catch {
    return null;
  }
}

interface Asset {
  bytes: Uint8Array;
  contentType: string | null;
}

/** Running size/count budget across the entry document and all assets. */
class InlineBudget {
  totalBytes = 0;
  assetCount = 0;

  chargeAsset(byteLength: number): void {
    if (this.assetCount >= MAX_ASSET_COUNT) {
      throw reportTooLarge(`more than ${MAX_ASSET_COUNT} assets`);
    }
    if (byteLength > MAX_ASSET_BYTES) {
      throw reportTooLarge(`an asset larger than ${MAX_ASSET_BYTES / (1024 * 1024)} MB`);
    }
    if (this.totalBytes + byteLength > MAX_TOTAL_BYTES) {
      throw reportTooLarge(`more than ${MAX_TOTAL_BYTES / (1024 * 1024)} MB total`);
    }
    this.assetCount += 1;
    this.totalBytes += byteLength;
  }
}

/**
 * Fetch and rewrite one report. Returns a self-contained document string:
 * images/media/fonts as `data:` URIs, scripts and stylesheets inlined.
 * External absolute URLs stay untouched — the inherited host CSP governs
 * them. Missing sibling assets degrade (refs dropped or elements removed)
 * rather than failing the render; size/count overruns throw a size error
 * identified by {@link isReportSizeError}.
 */
export async function loadReportDocument(
  resourceId: string,
  signedFetch: SignedFetch,
): Promise<string> {
  const { httpsUrl, pathName } = resolveResourceId(resourceId);
  const entryResponse = await signedFetch(httpsUrl);
  if (!entryResponse.ok) {
    throw new Error(`HTTP ${entryResponse.status} loading report`);
  }
  const contentLength = Number(entryResponse.headers.get("content-length") ?? 0);
  if (contentLength > MAX_HTML_BYTES) {
    throw reportTooLarge(`the document exceeds ${MAX_HTML_BYTES / (1024 * 1024)} MB`);
  }
  const html = await readText(entryResponse);
  if (html.length > MAX_HTML_BYTES) {
    throw reportTooLarge(`the document exceeds ${MAX_HTML_BYTES / (1024 * 1024)} MB`);
  }

  const budget = new InlineBudget();
  budget.totalBytes = html.length;
  const doc = new DOMParser().parseFromString(html, "text/html");

  // One fetch per unique object key — deduped across scripts, images, css.
  const assetCache = new Map<string, Promise<Asset | null>>();
  const fetchAssetByKey = (objectKey: string): Promise<Asset | null> => {
    let promise = assetCache.get(objectKey);
    if (promise === undefined) {
      const assetResourceId = `${resourceId.slice(0, resourceId.indexOf("/"))}/${objectKey}`;
      const assetUrl = resolveResourceId(assetResourceId).httpsUrl;
      promise = signedFetch(assetUrl).then(async (response) => {
        if (!response.ok) return null;
        const assetLength = Number(response.headers.get("content-length") ?? 0);
        if (assetLength > MAX_ASSET_BYTES) {
          throw reportTooLarge(`an asset larger than ${MAX_ASSET_BYTES / (1024 * 1024)} MB`);
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength === 0) return null;
        budget.chargeAsset(buffer.byteLength);
        return {
          bytes: new Uint8Array(buffer),
          contentType: response.headers.get("content-type"),
        };
      });
      assetCache.set(objectKey, promise);
    }
    return promise;
  };

  const dataUriForRef = async (baseKey: string, ref: string): Promise<string | null> => {
    const asset = await assetForKeyRef(baseKey, ref);
    return asset === null ? null : toDataUri(asset.bytes, asset.contentType);
  };

  /** Resolves a ref against a base object key; null = not an object key or missing. */
  const assetForKeyRef = (baseKey: string, ref: string): Promise<Asset | null> => {
    const objectKey = resolveObjectKey(baseKey, ref);
    if (objectKey === null) return Promise.resolve(null);
    return fetchAssetByKey(objectKey).catch((error: unknown) => {
      if (isReportSizeError(error)) throw error;
      return null;
    });
  };

  /** Resolves a document ref (relative to the entry) to an asset. */
  const assetForRef = (ref: string): Promise<Asset | null> => assetForKeyRef(pathName, ref);

  const textForRef = async (ref: string): Promise<string | null> => {
    const asset = await assetForRef(ref);
    return asset === null ? null : new TextDecoder("utf-8").decode(asset.bytes);
  };

  // Stylesheets: <link rel="stylesheet"> → inline <style> with url() assets inlined.
  // Covers both object-store refs and data: URIs (self-contained exports — the
  // CSP blocks data: stylesheets, so the body must become an inline <style>).
  for (const link of [...doc.querySelectorAll('link[rel~="stylesheet" i][href]')]) {
    const href = link.getAttribute("href")!;
    const dataUri = parseDataUri(href);
    const css = dataUri ? new TextDecoder("utf-8").decode(dataUri.bytes) : await textForRef(href);
    if (css === null) {
      if (resolveObjectKey(pathName, href) !== null) link.remove();
      continue;
    }
    // url() refs inside a stylesheet resolve relative to the stylesheet's own
    // directory, not the entry document's. A data: stylesheet has no base key;
    // its refs can only be absolute or data: and are left as written.
    const stylesheetKey = resolveObjectKey(pathName, href);
    const inlinedCss =
      stylesheetKey !== null ? await inlineCssUrls(css, stylesheetKey, dataUriForRef) : css;
    const style = doc.createElement("style");
    style.textContent = inlinedCss;
    link.replaceWith(style);
  }

  // <style> elements and style attributes: inline their url() refs.
  for (const styleElement of [...doc.querySelectorAll("style")]) {
    styleElement.textContent = await inlineCssUrls(
      styleElement.textContent ?? "",
      pathName,
      dataUriForRef,
    );
  }
  for (const styled of [...doc.querySelectorAll("[style]")]) {
    styled.setAttribute(
      "style",
      await inlineCssUrls(styled.getAttribute("style") ?? "", pathName, dataUriForRef),
    );
  }

  // Scripts: fetch the referenced body and inline it. CSP script-src has no
  // `data:` — a data-URI script (self-contained exports carry them) would be
  // silently blocked, so the body goes into an inline <script>, which the
  // policy permits.
  for (const script of [...doc.querySelectorAll("script[src]")]) {
    const src = script.getAttribute("src")!;
    const dataUri = parseDataUri(src);
    const body = dataUri ? new TextDecoder("utf-8").decode(dataUri.bytes) : await textForRef(src);
    if (body === null) {
      if (resolveObjectKey(pathName, src) !== null) script.remove();
      continue;
    }
    const inline = doc.createElement("script");
    for (const attr of [...script.attributes]) {
      if (attr.name !== "src") inline.setAttribute(attr.name, attr.value);
    }
    inline.text = body;
    script.replaceWith(inline);
  }

  // Images, media, tracks, sources: rewrite src to data URIs.
  for (const element of [...doc.querySelectorAll("[src]")]) {
    const src = element.getAttribute("src")!;
    const replacement = await dataUriForRef(pathName, src);
    if (replacement !== null) element.setAttribute("src", replacement);
  }
  for (const element of [...doc.querySelectorAll("[srcset]")]) {
    const parts: string[] = [];
    for (const candidate of element.getAttribute("srcset")!.split(",")) {
      const trimmed = candidate.trim();
      if (!trimmed) continue;
      const [url, ...descriptors] = trimmed.split(/\s+/);
      const replacement = url ? await dataUriForRef(pathName, url) : null;
      parts.push([replacement ?? url, ...descriptors].join(" "));
    }
    element.setAttribute("srcset", parts.join(", "));
  }
  for (const video of [...doc.querySelectorAll("video[poster]")]) {
    const replacement = await dataUriForRef(pathName, video.getAttribute("poster")!);
    if (replacement !== null) video.setAttribute("poster", replacement);
  }

  return `<!DOCTYPE html>${doc.documentElement.outerHTML}`;
}

const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'" ][^)]*))\s*\)/g;

/**
 * Inlines url() refs in CSS text. `baseKey` is the object key the CSS is
 * resolved against — the stylesheet's own key for linked stylesheets, the
 * entry document's key for inline <style> and style attributes.
 */
async function inlineCssUrls(
  cssText: string,
  baseKey: string,
  dataUriForRef: (baseKey: string, ref: string) => Promise<string | null>,
): Promise<string> {
  const matches: RegExpExecArray[] = [];
  CSS_URL_PATTERN.lastIndex = 0;
  let match = CSS_URL_PATTERN.exec(cssText);
  while (match !== null) {
    matches.push(match);
    match = CSS_URL_PATTERN.exec(cssText);
  }
  const urls = matches
    .map((m) => m[1] ?? m[2] ?? m[3]?.trim() ?? "")
    .filter((url) => resolveObjectKey(baseKey, url) !== null);
  const replacements = await Promise.all(urls.map((url) => dataUriForRef(baseKey, url)));
  let result = cssText;
  let replacementIndex = 0;
  let cursor = 0;
  let rewritten = "";
  for (const m of matches) {
    const url = m[1] ?? m[2] ?? m[3]?.trim() ?? "";
    rewritten += result.slice(cursor, m.index);
    if (resolveObjectKey(baseKey, url) !== null) {
      const replacement = replacements[replacementIndex]!;
      replacementIndex += 1;
      rewritten += replacement === null ? m[0] : `url("${replacement}")`;
    } else {
      rewritten += m[0];
    }
    cursor = m.index + m[0].length;
  }
  rewritten += result.slice(cursor);
  return rewritten;
}
