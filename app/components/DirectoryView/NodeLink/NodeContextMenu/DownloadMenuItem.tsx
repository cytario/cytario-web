import { Icon, MenuItem, Tooltip } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { toastBridge } from "~/toast-bridge";
import { getUint8ArrayForResourceId } from "~/utils/db/getBlobFromObjectNode";

const MAX_DOWNLOADABLE_SIZE = 256 * 1024 * 1024;

export function downloadFilenameFor(name: string, pathName: string): string {
  const ext = pathName.match(/(\.[a-z0-9]+)$/i)?.[1] ?? "";
  return !ext || name.endsWith(ext) ? name : name + ext;
}

export function DownloadMenuItem({ node }: { node: TreeNode }) {
  if (node.type !== "file") return null;

  const fileSize = node._Object?.Size;

  if (fileSize === undefined) return null;

  const tooLarge = fileSize > MAX_DOWNLOADABLE_SIZE;

  if (tooLarge) {
    return (
      <MenuItem
        id="download"
        icon="Download"
        isDisabled
        endContent={
          <Tooltip content="File too large for in-browser download (max 256 MB)">
            <span className="pointer-events-auto">
              <Icon icon="Info" size="sm" />
            </span>
          </Tooltip>
        }
      >
        Download
      </MenuItem>
    );
  }

  return (
    <MenuItem id="download" icon="Download" onAction={handleDownload}>
      Download
    </MenuItem>
  );

  async function handleDownload() {
    const downloadName = downloadFilenameFor(node.name, node.pathName);
    try {
      const data = await getUint8ArrayForResourceId(node.id);
      const blob = new Blob([data.slice()]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toastBridge.emit({ variant: "success", message: `Downloaded ${downloadName}` });
    } catch (error) {
      console.error("Download failed", error);
      toastBridge.emit({ variant: "error", message: `Could not download ${node.name}` });
    }
  }
}
