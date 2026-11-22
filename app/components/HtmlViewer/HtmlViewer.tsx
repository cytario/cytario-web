import { Button } from "@cytario/design";
import { useCallback, useEffect, useRef, useState } from "react";

import { isReportSizeError, loadReportDocument, type ReportAssetFetcher } from "./loadReport";
import { toBase64 } from "./renderMath";
import { BRIDGE_REQUEST_SOURCE, BRIDGE_RESPONSE_SOURCE, type BridgeRequest } from "./reportShim";
import { LoaderView } from "../Loader/LoaderView";
import type { SignedFetch } from "~/utils/signedFetch";

interface HtmlViewerProps {
  resourceId: string;
  signedFetch: SignedFetch;
}

/**
 * Interactive HTML report viewer (Quarto and friends). The rewritten
 * self-contained document renders in a sandboxed srcDoc iframe — `allow-scripts`
 * only, never `allow-same-origin`, so report scripts cannot reach the host
 * page, its cookies, or its storage. The iframe inherits the host CSP
 * (documents carry it; srcDoc frames have no origin of their own).
 *
 * The frame's opaque origin blocks every network request (the inherited
 * CSP's `'self'` can never match it), so report scripts that fetch relative
 * asset refs at runtime (htmlwidgets-style data loads) are served by the
 * bridge below: shimmed `fetch` in the frame → postMessage → signed-read
 * fetch in the host context → response back to the frame.
 */
export const HtmlViewer = ({ resourceId, signedFetch }: HtmlViewerProps) => {
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fetchAssetRef = useRef<ReportAssetFetcher | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAssetRef.current = null;
    loadReportDocument(resourceId, signedFetch)
      .then(({ documentHtml: html, fetchAsset }) => {
        fetchAssetRef.current = fetchAsset;
        if (!cancelled) setDocumentHtml(html);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      fetchAssetRef.current = null;
    };
  }, [resourceId, signedFetch, reloadKey]);

  // Asset bridge: shimmed relative fetches inside the frame arrive as
  // postMessage requests and are satisfied through the signed-read pipeline.
  // The iframe content window — not an origin, which the sandbox hides — is
  // the source of truth for who may use the bridge.
  useEffect(() => {
    const handleBridgeMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as Partial<BridgeRequest>;
      if (data?.source !== BRIDGE_REQUEST_SOURCE || typeof data.ref !== "string") return;
      const ref = data.ref;
      const requestId = typeof data.requestId === "string" ? data.requestId : "";
      fetchAssetRef
        .current?.(ref)
        .then((asset) => {
          if (asset === null) {
            return {
              source: BRIDGE_RESPONSE_SOURCE,
              requestId,
              status: 404,
              contentType: null,
              bodyBase64: null,
              error: null,
            } as const;
          }
          return {
            source: BRIDGE_RESPONSE_SOURCE,
            requestId,
            status: 200,
            contentType: asset.contentType,
            bodyBase64: toBase64(asset.bytes),
            error: null,
          } as const;
        })
        .catch((err: unknown) => ({
          source: BRIDGE_RESPONSE_SOURCE,
          requestId,
          status: 0,
          contentType: null,
          bodyBase64: null,
          error:
            err instanceof Error && isReportSizeError(err)
              ? err.message
              : "The report viewer could not load this asset",
        }))
        .then((response) => {
          iframeRef.current?.contentWindow?.postMessage(response, "*");
        });
    };
    window.addEventListener("message", handleBridgeMessage);
    return () => window.removeEventListener("message", handleBridgeMessage);
  }, []);

  const handleRetry = useCallback(() => {
    setDocumentHtml(null);
    setError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  }, []);

  if (loading) {
    return <LoaderView label="Loading report…" />;
  }

  if (error !== null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-foreground">{error}</p>
        <Button variant="secondary" onPress={handleRetry}>
          Retry
        </Button>
      </div>
    );
  }

  if (documentHtml === null) {
    return null;
  }

  return (
    <iframe
      key={reloadKey}
      ref={iframeRef}
      title="Report"
      sandbox="allow-scripts"
      srcDoc={documentHtml}
      className="h-full w-full border-0"
    />
  );
};
