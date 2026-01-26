import { filesize } from "filesize";
import { ReactNode } from "react";

import { TreeNode } from "./buildDirectoryTree";
import { NodeLink } from "./NodeLink/NodeLink";
import { Table } from "~/components/Table";
import { formatHumanReadableDate } from "~/utils/formatHumanReadableDate";

const getColumns = (nodes: TreeNode[]): string[] => {
  switch (nodes[0].type) {
    case "bucket":
      return ["Name", "Provider", "Endpoint", "Region", "RoleARN"];
    case "directory":
      return ["Name"];
    case "file":
    default:
      return ["Name", "Last Modified", "Size"];
  }
};

const getData = (nodes: TreeNode[]): ReactNode[][] => {
  switch (nodes[0].type) {
    case "bucket":
      return nodes.map((node) => {
        return [
          <NodeLink key={node.name} node={node} listStyle="list" />,
          node._Bucket?.provider,
          node._Bucket?.endpoint,
          node._Bucket?.region,
          node._Bucket?.roleArn,
        ];
      });
    case "directory":
      return nodes.map((node) => {
        return [<NodeLink key={node.name} node={node} listStyle="list" />];
      });
    case "file":
    default:
      return nodes.map((node) => {
        return [
          <NodeLink key={node.name} node={node} listStyle="list" />,
          node._Object?.LastModified &&
            formatHumanReadableDate(node._Object.LastModified),
          node._Object && filesize(node._Object.Size ?? 0).toString(),
        ];
      });
  }
};

export function DirectoryViewTable({ nodes }: { nodes: TreeNode[] }) {
  const columns = getColumns(nodes);
  const data = getData(nodes);
  return <Table columns={columns} data={data} />;
}
