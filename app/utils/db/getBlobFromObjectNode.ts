import {
  useFileStore,
  type DownloadProgress,
} from "../localFilesStore/useFileStore";
import { parseResourceId } from "../resourceId";

export type ProgressCallback = (progress: DownloadProgress) => void;

/**
 * Download a file from URL with progress tracking
 */
async function downloadFileWithProgress(
  url: string,
  onProgress?: ProgressCallback
): Promise<Uint8Array> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.statusText}`);
  }

  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    throw new Error("Response body is null");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    chunks.push(value);
    loaded += value.length;

    if (onProgress && total > 0) {
      onProgress({
        loaded,
        total,
        percentage: Math.round((loaded / total) * 100),
      });
    }
  }

  // Combine all chunks into a single Uint8Array
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

/**
 * Get presigned URL for a given resourceId
 */
async function getPresignedUrl(resourceId: string): Promise<string> {
  const { provider, bucketName, pathName } = parseResourceId(resourceId);

  const response = await fetch(`/presign/${provider}/${bucketName}/${pathName}`);
  const data = await response.json();

  return data.url;
}

/**
 * Get file data for a resourceId, with caching and progress tracking
 * @param resourceId - S3 resource identifier (provider/bucketName/pathName)
 */
export const getUint8ArrayForResourceId = async (
  resourceId: string
): Promise<Uint8Array> => {
  const { getFile, saveFile, setFileProgress } = useFileStore.getState();

  // Check cache first
  const cachedData = await getFile(resourceId);

  if (cachedData) {
    return cachedData;
  } else {
    const url = await getPresignedUrl(resourceId);

    // Download file with progress, updating store
    const data = await downloadFileWithProgress(url, (progress) => {
      setFileProgress(resourceId, progress);
    });

    // Save to cache
    await saveFile(resourceId, data);

    return data;
  }
};
