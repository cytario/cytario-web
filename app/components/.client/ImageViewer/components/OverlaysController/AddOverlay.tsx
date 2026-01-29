import { useEffect } from "react";
import { useFetcher } from "react-router";

import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import { Input } from "~/components/Controls/Input";
import {
  TreeNode,
  buildDirectoryTree,
} from "~/components/DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "~/components/DirectoryView/DirectoryViewTree";
import { DEFAULT_RESULTS } from "~/components/GlobalSearch/GlobalSearch";
import { useNotificationStore } from "~/components/Notification/Notification.store";
import { ObjectPresignedUrl } from "~/routes/objects.route";
import { SearchRouteLoaderResponse } from "~/routes/search.route";
import { useCredentialsStore } from "~/utils/credentialsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";
import { createResourceId } from "~/utils/resourceId";

export const AddOverlay = ({
  callback,
  query,
}: {
  callback?: () => void;
  query: string;
}) => {
  const addOverlaysState = useViewerStore(select.addOverlaysState);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const obj: Record<string, "csv" | "parquet"> = {
    "convert-overlay": "csv",
    "load-overlay": "parquet",
  };

  const extension = obj[query];

  const searchString = `/search?query=${extension}`;

  // Fetch available CSV files on mount
  const objectsFetcher = useFetcher<SearchRouteLoaderResponse>();

  useEffect(() => {
    if (!objectsFetcher.data && objectsFetcher.state === "idle") {
      objectsFetcher.load(searchString);
    }
  }, [objectsFetcher, objectsFetcher.state, searchString]);

  // Derive results from fetcher data
  const results = objectsFetcher.data?.results ?? DEFAULT_RESULTS;

  // Nodes across buckets - keys are in format provider/bucketName
  const nodes: TreeNode[] = Object.keys(results.files).map((key) => {
    const [provider, bucketName] = key.split("/");
    const objects = results.files[key] as ObjectPresignedUrl[];
    return {
      bucketName,
      name: bucketName,
      type: "bucket",
      provider,
      children: buildDirectoryTree(bucketName, objects, provider, undefined),
    };
  });

  return (
    <div className="relative flex flex-col gap-2">
      <Input value={extension} readOnly />

      <DirectoryTree
        nodes={nodes}
        action={async (node) => {
          try {
            if (!node.pathName || !node.bucketName) {
              throw new Error("Invalid node selected");
            }

            const resourceId = createResourceId(
              node.provider,
              node.bucketName,
              node.pathName
            );

            // Get credentials and bucket config from the store using provider/bucketName key
            // Use getState() to access store outside of React component render
            const storeKey = `${node.provider}/${node.bucketName}`;
            const storeState = useCredentialsStore.getState();
            const credentials = storeState.getCredentials(storeKey);
            const bucketConfig = storeState.getBucketConfig(storeKey);

            if (!bucketConfig) {
              throw new Error("Bucket configuration not found");
            }

            if (!credentials) {
              throw new Error(
                `No credentials found for bucket: ${storeKey}`
              );
            }

            if (extension === "csv") {
              convertCsvToParquet(resourceId, credentials);
              addNotification({
                status: "success",
                message: `Started conversion: ${node.name}`,
              });
            } else {
              addOverlaysState({ [resourceId]: {} });

              addNotification({
                status: "success",
                message: `Overlay added: ${node.name}`,
              });
            }

            // Close the modal/callback
            if (callback) {
              callback();
            }
          } catch (error) {
            console.error("Error processing overlay:", error);
            addNotification({
              status: "error",
              message: `Failed to process overlay: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
        }}
      />
    </div>
  );
};
