import katex from "katex";
import katexCssUrl from "katex/dist/katex.min.css?url";

/**
 * Host-side math pre-render. Quarto documents leave TeX in
 * `<span class="math inline">\\(…\\)</span>` / `<span class="math display">\\[…]\\</span>`
 * for a math runtime (MathJax/KaTeX) to typeset — but inside the sandboxed
 * report frame no math runtime can load (the inherited CSP blocks external
 * CDNs and the frame's opaque origin blocks same-origin scripts). The math is
 * therefore rendered here, in the host context, before the document is handed
 * to the frame: KaTeX's DOM output is plain HTML+CSS, which the frame can
 * display without any runtime. Unparseable TeX degrades — the span keeps its
 * original content — consistent with the pipeline's degrade-not-fail posture.
 */

const INLINE_MATH_PATTERN = /^\s*\\\((.*)\\\)\s*$/;
const DISPLAY_MATH_PATTERN = /^\s*\\\[(.*)\\\]\s*$/;

/** Extract the TeX body and display mode from a `.math` span's text. */
function parseMathText(text: string): { tex: string; displayMode: boolean } | null {
  const inline = INLINE_MATH_PATTERN.exec(text);
  if (inline) return { tex: inline[1]!, displayMode: false };
  const display = DISPLAY_MATH_PATTERN.exec(text);
  if (display) return { tex: display[1]!, displayMode: true };
  return null;
}

/** Render one TeX string to KaTeX HTML; null when KaTeX cannot parse it. */
function renderTex(tex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: true, strict: false });
  } catch {
    return null;
  }
}

/**
 * Replace every `.math` span in the document with its KaTeX rendering.
 * Returns the number of spans rendered; unparseable spans are left as-is.
 */
export function renderMathSpans(doc: Document): number {
  let rendered = 0;
  for (const span of [...doc.querySelectorAll("span.math")]) {
    const parsed = parseMathText(span.textContent ?? "");
    if (parsed === null) continue;
    const html = renderTex(parsed.tex, parsed.displayMode);
    if (html === null) continue;
    span.innerHTML = html;
    rendered += 1;
  }
  return rendered;
}

let katexCssText: string | null = null;

/**
 * The KaTeX stylesheet, with its `url(fonts/…)` refs rewritten to host-served
 * font data (absolute URLs against the host origin — the host can fetch them,
 * the sandboxed frame cannot). Result is cached; a failure returns null and
 * the caller degrades (math renders without its dedicated fonts).
 */
export async function katexStylesheet(
  fetchImpl: (url: string) => Promise<Response>,
): Promise<string | null> {
  if (katexCssText !== null) return katexCssText;

  const FONT_URL_PATTERN = /url\((["']?)(fonts\/[^)"']+?)\1\)/g;
  let css: string;
  try {
    const response = await fetchImpl(katexCssUrl);
    if (!response.ok) return null;
    css = await response.text();
  } catch {
    return null;
  }

  const fonts = new Map<string, Promise<string | null>>();
  const fontFor = (ref: string): Promise<string | null> => {
    let promise = fonts.get(ref);
    if (promise === undefined) {
      const fontUrl = resolveRelativeUrl(katexCssUrl, ref);
      if (fontUrl === null) return Promise.resolve(null);
      promise = fetchImpl(fontUrl)
        .then(async (response) => {
          if (!response.ok) return null;
          const buffer = new Uint8Array(await response.arrayBuffer());
          const contentType = response.headers.get("content-type") ?? "";
          return `data:${contentType || "application/octet-stream"};base64,${toBase64(buffer)}`;
        })
        .catch(() => null);
      fonts.set(ref, promise);
    }
    return promise;
  };

  const replacements = new Map<string, string | null>();
  for (const match of css.matchAll(FONT_URL_PATTERN)) {
    const [, , ref] = match;
    if (ref && !replacements.has(ref)) replacements.set(ref, await fontFor(ref));
  }
  katexCssText = css.replace(FONT_URL_PATTERN, (whole, quote: string, ref: string) => {
    const replacement = replacements.get(ref);
    return replacement === undefined || replacement === null
      ? whole
      : `url(${quote}${replacement}${quote})`;
  });
  return katexCssText;
}

function resolveRelativeUrl(baseUrl: string, ref: string): string | null {
  if (!ref.startsWith("fonts/")) return null;
  // The stylesheet URL ends with `katex.min.css`; the fonts live in a sibling
  // `fonts/` directory. Absolute URL construction is unreliable in test
  // environments, so the substitution is purely textual.
  const cssAt = baseUrl.lastIndexOf("katex.min.css");
  if (cssAt === -1) return null;
  return `${baseUrl.slice(0, cssAt)}${ref}`;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
