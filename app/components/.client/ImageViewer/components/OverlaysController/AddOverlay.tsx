import { _Object } from "@aws-sdk/client-s3";
import { useEffect } from "react";
import { useFetcher } from "react-router";

import { select } from "../../state/selectors";
import { useViewerStore } from "../../state/ViewerStoreContext";
import Input from "~/components/Controls/Input";
import { buildDirectoryTree } from "~/components/DirectoryView/buildDirectoryTree";
import DirectoryTree from "~/components/DirectoryView/DirectoryViewTree";
import { useNotificationStore } from "~/components/Notification/Notification.store";
import { BucketFiles, SearchRouteLoaderResponse } from "~/routes/search.route";
import { useCredentialsStore } from "~/utils/credentialsStore";
import { convertCsvToParquet } from "~/utils/db/convertCsvToParquet";
import { getBucketKeyFromResourceId } from "~/utils/resourceId";

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
  const results: BucketFiles = objectsFetcher.data?.results ?? {};

  return (
    <div className="relative flex flex-col gap-2">
      <Input value={extension} readOnly />

      {Object.keys(results).map((key) => {
        const objects = results[key];

        const nodes = buildDirectoryTree(key, objects, undefined);

        return (
          <>
            <div>{key}</div>
            <DirectoryTree
              key={key}
              nodes={nodes}
              action={async (node) => {
                try {
                  if (!node.id) {
                    throw new Error("Invalid node selected");
                  }

                  const resourceId = node.id;
                  // Get bucket key (provider/bucketName) for credentials lookup
                  const storeKey = getBucketKeyFromResourceId(resourceId);

                  // Get credentials from the store using provider/bucketName key
                  // Credentials are per-bucket, not per-file
                  // Use getState() to access store outside of React component render
                  const credentials = useCredentialsStore
                    .getState()
                    .getCredentials(storeKey);

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
          </>
        );
      })}
    </div>
  );
};
