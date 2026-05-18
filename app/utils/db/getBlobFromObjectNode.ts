import { resolveResourceId } from "../connectionsStore/selectors";
import { useFileStore, type DownloadProgress } from "../localFilesStore/useFileStore";
import { createSignedFetch } from "../signedFetch";

export type ProgressCallback = (progress: DownloadProgress) => void;

/** Stream a response body into a `Uint8Array`, emitting progress when possible. */
async function readStreamWithProgress(
  response: Response,
  onProgress?: ProgressCallback,
): Promise<Uint8Array> {
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

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
}

/** Cached SigV4 GetObject for a resourceId, with progress tracking. */
export const getUint8ArrayForResourceId = async (resourceId: string): Promise<Uint8Array> => {
  const { getFile, saveFile, setFileProgress } = useFileStore.getState();

  const cachedData = await getFile(resourceId);
  if (cachedData) return cachedData;

  const { connectionConfig, credentials, httpsUrl } = resolveResourceId(resourceId);
  const signedFetch = createSignedFetch(() => credentials, connectionConfig);

  const response = await signedFetch(httpsUrl);
  const data = await readStreamWithProgress(response, (progress) => {
    setFileProgress(resourceId, progress);
  });

  await saveFile(resourceId, data);

  return data;
};
