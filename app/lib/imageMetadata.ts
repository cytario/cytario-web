import type { ImageMetadata, Image, LoadOptions } from "@cytario/plugin-api";
import { formatRegistry } from "~/components/ImageViewer/state/formatRegistry";
import { liveCredentials, resolveResourceId } from "~/utils/connectionsStore/selectors";
import { createSignedFetch } from "~/utils/signedFetch";

class ImageMetadataImpl implements ImageMetadata {
  async read(connectionId: string, path: string): Promise<Image | null> {
    try {
      const resourceId = `${connectionId}/${path}`;
      const resolved = resolveResourceId(resourceId);
      const signedFetch = createSignedFetch(
        liveCredentials(connectionId),
        resolved.region,
        connectionId,
      );
      const opts: LoadOptions = { signedFetch };
      const { handler } = formatRegistry.resolve(resolved.httpsUrl);
      if (handler.readCharacteristics) {
        try {
          return await handler.readCharacteristics(resolved.httpsUrl, opts);
        } catch {
          // A failing cheap read is best-effort — fall through to load().
        }
      }
      const loaded = await handler.load(resolved.httpsUrl, opts);
      return loaded.metadata;
    } catch {
      // Never throw out of this method; absence is structural, not an error.
      return null;
    }
  }

  async size(connectionId: string, path: string): Promise<number | null> {
    try {
      const resourceId = `${connectionId}/${path}`;
      const resolved = resolveResourceId(resourceId);
      const signedFetch = createSignedFetch(
        liveCredentials(connectionId),
        resolved.region,
        connectionId,
      );
      const response = await signedFetch(resolved.httpsUrl, { method: "HEAD" });
      if (!response.ok) return null;
      const contentLength = response.headers.get("content-length");
      if (contentLength === null) return null;
      const size = Number(contentLength);
      return Number.isFinite(size) && size >= 0 ? size : null;
    } catch {
      return null;
    }
  }
}

export const imageMetadata = new ImageMetadataImpl();
