import { IconButton } from "@cytario/design";

import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

/** Sidebar-header eye toggle for the show-hidden-files layout preference. */
export function ShowHiddenFilesToggleButton() {
  const showHiddenFiles = useLayoutStore((s) => s.showHiddenFiles);
  const toggleShowHiddenFiles = useLayoutStore((s) => s.toggleShowHiddenFiles);

  return (
    <IconButton
      icon={showHiddenFiles ? "Eye" : "EyeOff"}
      label="Show hidden files"
      aria-pressed={showHiddenFiles}
      onPress={toggleShowHiddenFiles}
      variant="ghost"
      size="sm"
    />
  );
}
