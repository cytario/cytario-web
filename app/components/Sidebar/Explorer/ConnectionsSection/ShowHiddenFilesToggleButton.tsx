import { IconButton } from "@cytario/design";

import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";

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
