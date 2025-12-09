import { decompress } from "lzw-tiff-decoder";

self.onmessage = async (event) => {
  const { taskId, buffer, maxUncompressedSize } = event.data;

  try {
    const bytes = new Uint8Array(buffer);
    const decoded = await decompress(bytes, maxUncompressedSize);

    self.postMessage({ taskId, result: decoded.buffer }, [decoded.buffer]);
  } catch (error) {
    self.postMessage({ taskId, error: error.message });
  }
};
