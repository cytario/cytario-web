import { Button } from "@cytario/design";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { generateTiffOffsets } from "~/components/.client/ImageViewer/state/loaders/generateOffsets";
import { useViewerRegistryStore } from "~/components/.client/ImageViewer/state/store/ViewerStoreContext";
import { RouteModal } from "~/components/RouteModal";
import { toastBridge, toToastVariant } from "~/toast-bridge";
import { liveCredentials, resolveResourceId } from "~/utils/connectionsStore/selectors";
import { useConnectionsStore } from "~/utils/connectionsStore/useConnectionsStore";
import { createSignedFetch } from "~/utils/signedFetch";

type State = "idle" | "generating" | "uploading" | "done" | "error";

export default function GenerateOffsetsModal({ onClose }: { onClose: () => void }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resourceId = searchParams.get("resourceId") ?? "";
  const connectionId = searchParams.get("connectionId") ?? "";

  const evictViewer = useViewerRegistryStore((s) => s.evictViewer);

  const handleGenerate = async () => {
    setState("generating");
    setErrorMsg(null);
    try {
      const conn = useConnectionsStore.getState().connections[connectionId];
      const region = conn?.provider?.region;
      const sf = createSignedFetch(liveCredentials(connectionId), region, connectionId);
      const { httpsUrl } = resolveResourceId(resourceId);
      const offsetsUrl = httpsUrl.replace(/\.ome\.tiff?$/i, ".offsets.json");

      const offsets = await generateTiffOffsets(httpsUrl, sf);

      setState("uploading");
      const putRes = await sf(offsetsUrl, {
        method: "PUT",
        body: JSON.stringify(offsets),
      });
      if (!putRes.ok) {
        throw new Error(`Upload failed: ${putRes.status} ${putRes.statusText}`);
      }

      setState("done");
      evictViewer(resourceId);
      toastBridge.emit({
        variant: toToastVariant("success"),
        message: "Index file saved. Reloading image…",
      });
      onClose();
      navigate(location.pathname, { replace: true });
    } catch (e) {
      setState("error");
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const isBusy = state === "generating" || state === "uploading";

  return (
    <RouteModal title="Speed up this image" onClose={onClose} isDismissable={!isBusy}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          This image can open faster. A small index file can be generated and saved next to the
          image so that every time it is opened — by you or anyone else in your organization — it
          loads more quickly. Generating it takes a moment and does not modify the image itself.
        </p>
        {errorMsg && (
          <p className="text-sm text-destructive" role="alert">
            {errorMsg}
          </p>
        )}
        {state === "generating" && (
          <p className="text-sm text-muted-foreground">Analyzing image structure…</p>
        )}
        {state === "uploading" && (
          <p className="text-sm text-muted-foreground">Saving index file…</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onPress={onClose} isDisabled={isBusy}>
            Cancel
          </Button>
          <Button onPress={handleGenerate} isDisabled={isBusy || state === "done"}>
            {isBusy ? "Working…" : "Generate"}
          </Button>
        </div>
      </div>
    </RouteModal>
  );
}
