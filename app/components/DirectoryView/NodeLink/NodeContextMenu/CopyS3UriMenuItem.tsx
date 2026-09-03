import { MenuItem } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { toastBridge } from "~/toast-bridge";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";

export function CopyS3UriMenuItem({ node }: { node: TreeNode }) {
  return (
    <MenuItem id="copy-s3-uri" icon="Copy" onAction={copyS3Uri}>
      Copy S3 URI
    </MenuItem>
  );

  async function copyS3Uri() {
    try {
      const { s3Uri } = resolveResourceId(node.id);
      await navigator.clipboard.writeText(s3Uri);
      toastBridge.emit({ variant: "success", message: "S3 URI copied to clipboard" });
    } catch {
      toastBridge.emit({ variant: "error", message: "Could not copy the S3 URI" });
    }
  }
}
