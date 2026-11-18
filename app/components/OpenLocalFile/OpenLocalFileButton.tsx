import { IconButton, useToast } from "@cytario/design";
import { useRef } from "react";

import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { holdLocalSource } from "~/components/OpenLocalFile/localSourceHolder";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useOrgNavigate } from "~/hooks/useOrgPath";
import { ensureBuiltinFormats } from "~/lib/imageMetadata";
import { getFileCategory } from "~/utils/fileType";

/**
 * Header action that opens the browser's unfiltered file picker and dispatches
 * the picked file by name. A name claimed by a local-source image handler
 * navigates to the local viewer route; anything else surfaces the local-open
 * notice — the type opens from a connected bucket, and nothing was uploaded.
 */
export function OpenLocalFileButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const orgNavigate = useOrgNavigate();
  const user = useCurrentUser();

  if (!user) return null;

  const openPicker = () => inputRef.current?.click();

  const onPick = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Re-picking the same file must re-fire the change event.
    event.target.value = "";
    if (!file) return;

    // The header renders before any viewer chunk, so the built-in handlers
    // are not registered yet; the resolution needs them present.
    await ensureBuiltinFormats();

    if (getFileCategory(file.name) === "image" && formatRegistry.resolveLocalSource(file.name)) {
      holdLocalSource(file.name, file);
      orgNavigate(`/local/${encodeURIComponent(file.name)}`);
      return;
    }

    toast({
      variant: "info",
      message:
        `"${file.name}" opens from a connected bucket — local viewing is ` +
        "available for whole-slide image files only. Nothing was uploaded.",
    });
  };

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
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onPick}
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );
}
