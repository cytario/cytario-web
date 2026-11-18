import { IconButton, useToast } from "@cytario/design";
import { useEffect, useRef } from "react";

import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { holdLocalSource } from "~/components/OpenLocalFile/localSourceHolder";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useOrgNavigate } from "~/hooks/useOrgPath";
import { ensureBuiltinFormats } from "~/lib/imageMetadata";
import { getFileCategory } from "~/utils/fileType";

interface PickDispatch {
  orgNavigate: (to: string | number) => void;
  toast: (toast: { variant: "success" | "error" | "info"; message: string }) => void;
}

/**
 * Dispatch a picked local file. Module scope so the DOM listener can hold it
 * without re-attaching on every render; the live callbacks arrive via the
 * ref set in an effect.
 */
const makePickDispatcher = (dispatch: PickDispatch) => async (file: File | undefined) => {
  if (!file) return;

  // The header renders before any viewer chunk, so the built-in handlers
  // are not registered yet; the resolution needs them present.
  try {
    await ensureBuiltinFormats();
  } catch {
    dispatch.toast({
      variant: "error",
      message: "The viewer could not be loaded to open this file.",
    });
    return;
  }

  if (getFileCategory(file.name) === "image" && formatRegistry.resolveLocalSource(file.name)) {
    holdLocalSource(file.name, file);
    dispatch.orgNavigate(`/local/${encodeURIComponent(file.name)}`);
    return;
  }

  dispatch.toast({
    variant: "info",
    message:
      `"${file.name}" opens from a connected bucket — local viewing is ` +
      "available for whole-slide image files only. Nothing was uploaded.",
  });
};

/**
 * Header action that opens the browser's unfiltered file picker and dispatches
 * the picked file by name. A name claimed by a local-source image handler
 * navigates to the local viewer route; anything else surfaces the local-open
 * notice — the type opens from a connected bucket, and nothing was uploaded.
 */
export function OpenLocalFileButton() {
  const { toast } = useToast();
  const orgNavigate = useOrgNavigate();
  const user = useCurrentUser();
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!user || !input) return;

    // A native listener attached whenever the live node is current: the
    // input's DOM node is replaced when the SSR'd header hydrates, so a
    // listener bound at first effect run can end up on an orphaned node.
    const dispatchPick = makePickDispatcher({ orgNavigate, toast });
    const handleChange = () => {
      const file = input.files?.[0];
      // Re-picking the same file must re-fire the change event.
      input.value = "";
      void dispatchPick(file);
    };
    input.addEventListener("change", handleChange);
    // Marks the interactive wiring as live for the pick flow's readiness
    // gate (the SSR'd input exists before hydration attaches anything).
    input.dataset.localOpenReady = "true";
    return () => {
      delete input.dataset.localOpenReady;
      input.removeEventListener("change", handleChange);
    };
  }, [user, orgNavigate, toast]);

  const openPicker = () => inputRef.current?.click();

  if (!user) return null;

  return (
    <>
      <IconButton
        icon="FolderOpen"
        label="Open local file"
        variant="ghost"
        size="sm"
        onPress={openPicker}
      />
      {/* No accept attribute: the picker is deliberately unfiltered; the
          dispatch after the pick decides what opens. */}
      <input ref={inputRef} type="file" className="hidden" aria-hidden="true" tabIndex={-1} />
    </>
  );
}
