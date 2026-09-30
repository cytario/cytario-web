import { Button } from "@cytario/design";
import { useCallback, useEffect, useState } from "react";

import { loadReportDocument } from "./loadReport";
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
 */
export const HtmlViewer = ({ resourceId, signedFetch }: HtmlViewerProps) => {
  const [documentHtml, setDocumentHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadReportDocument(resourceId, signedFetch)
      .then((html) => {
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
    };
  }, [resourceId, signedFetch, reloadKey]);

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
      title="Report"
      sandbox="allow-scripts"
      srcDoc={documentHtml}
      className="h-full w-full border-0"
    />
  );
};
