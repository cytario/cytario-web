/**
 * Frame-side shim injected as the first script of every rewritten report
 * document. Inside `sandbox="allow-scripts"` the frame has an opaque origin,
 * so two things a normal document gets for free are broken: fragment links
 * (`about:srcdoc` has no URL of its own — an anchor click navigates the frame
 * to the host origin and destroys the report) and any network access (the
 * inherited CSP's `'self'` can never match an opaque origin, so every runtime
 * `fetch` rejects). The shim restores both: fragment clicks scroll within
 * the document, and relative GET fetches are forwarded to the host through a
 * postMessage bridge that resolves them against the entry object key on the
 * platform's signed-read path.
 */

export const BRIDGE_REQUEST_SOURCE = "cytario-report-bridge";
export const BRIDGE_RESPONSE_SOURCE = "cytario-report-bridge-response";

export interface BridgeRequest {
  readonly source: typeof BRIDGE_REQUEST_SOURCE;
  readonly requestId: string;
  readonly ref: string;
}

export interface BridgeResponse {
  readonly source: typeof BRIDGE_RESPONSE_SOURCE;
  readonly requestId: string;
  readonly status: number;
  readonly contentType: string | null;
  readonly bodyBase64: string | null;
  readonly error: string | null;
}

export function buildReportShim(): string {
  return `(function () {
  var pending = Object.create(null);
  var seq = 0;

  function isBridgeableRef(ref) {
    return typeof ref === "string" && ref !== "" && ref.charAt(0) !== "#" &&
      ref.slice(0, 2) !== "//" && !/^[a-zA-Z][a-zA-Z0-9+.\\-]*:/.test(ref);
  }

  function bridgedFetch(ref) {
    return new Promise(function (resolve, reject) {
      seq += 1;
      var requestId = "req" + seq;
      pending[requestId] = { resolve: resolve, reject: reject };
      parent.postMessage(
        { source: ${JSON.stringify(BRIDGE_REQUEST_SOURCE)}, requestId: requestId, ref: ref },
        "*",
      );
    });
  }

  window.addEventListener("message", function (event) {
    if (event.source !== parent) return;
    var data = event.data;
    if (!data || data.source !== ${JSON.stringify(BRIDGE_RESPONSE_SOURCE)} || typeof data.requestId !== "string") return;
    var entry = pending[data.requestId];
    if (!entry) return;
    delete pending[data.requestId];
    if (data.error !== null && data.error !== undefined) {
      entry.reject(new TypeError(data.error));
      return;
    }
    var body = new ArrayBuffer(0);
    if (data.bodyBase64) {
      var binary = atob(data.bodyBase64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      body = bytes.buffer;
    }
    var headers = {};
    if (data.contentType) headers["content-type"] = data.contentType;
    entry.resolve(new Response(body, { status: data.status, headers: headers }));
  });

  document.addEventListener("click", function (event) {
    var node = event.target;
    while (node && node.nodeName !== "A") node = node.parentNode;
    if (!node) return;
    var href = node.getAttribute("href");
    if (!href) return;
    var hashAt = href.indexOf("#");
    if (hashAt === -1) return;
    var path = href.slice(0, hashAt);
    if (path !== "" && !/^[^?#]*\\.html?$/i.test(path)) return;
    var id = decodeURIComponent(href.slice(hashAt + 1));
    if (!id) return;
    var target = document.getElementById(id);
    if (!target) {
      var named = document.getElementsByName(id);
      if (named.length) target = named[0];
    }
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth" });
  }, true);

  var nativeFetch = window.fetch;
  if (typeof nativeFetch === "function") {
    window.fetch = function (input, init) {
      var ref = null;
      if (typeof input === "string") ref = input;
      else if (input && typeof input.url === "string") ref = input.url;
      if (!isBridgeableRef(ref)) return nativeFetch.apply(this, arguments);
      if (init && init.method && String(init.method).toUpperCase() !== "GET") {
        return Promise.reject(new TypeError("The report viewer bridge supports GET requests only"));
      }
      return bridgedFetch(ref);
    };
  }
})();`;
}
