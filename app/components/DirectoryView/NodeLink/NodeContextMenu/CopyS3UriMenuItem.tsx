import { MenuItem, useToast } from "@cytario/design";

import { type TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { resolveResourceId } from "~/utils/connectionsStore/selectors";

export function CopyS3UriMenuItem({ node }: { node: TreeNode }) {
  const { toast } = useToast();
  return (
    <MenuItem id="copy-s3-uri" icon="Copy" onAction={copyS3Uri}>
      Copy S3 URI
    </MenuItem>
  );

  async function copyS3Uri() {
    try {
      const { s3Uri } = resolveResourceId(node.id);
      await navigator.clipboard.writeText(s3Uri);
      toast({ variant: "success", message: "S3 URI copied to clipboard" });
    } catch {
      toast({ variant: "error", message: "Could not copy the S3 URI" });
    }
  }
}
