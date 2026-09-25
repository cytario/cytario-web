import type { ImageMetadata, Image, LoadOptions } from "@cytario/plugin-api";
import {
  DuplicateRegistrationError,
  formatRegistry,
} from "~/components/ImageViewer/state/formatRegistry";
import { liveCredentials, resolveResourceId } from "~/utils/connectionsStore/selectors";
import { createSignedFetch } from "~/utils/signedFetch";

// The built-in OME-TIFF/OME-Zarr handlers otherwise register only when a
// viewer chunk mounts (viewerRegistry module scope), but this capability must
// answer with no viewer ever mounted. The builtins module statically imports
// geotiff/viv, which must stay out of the entry and SSR bundles — hence the
// lazy import, which lands those deps in the shared viewer chunk instead.
let builtinFormatsModule: Promise<{
  registerBuiltinFormats: () => void;
}> | null = null;

async function ensureBuiltinFormats(): Promise<void> {
  builtinFormatsModule ??= import("~/components/.client/ImageViewer/state/formats/builtins");
  try {
    const { registerBuiltinFormats } = await builtinFormatsModule;
    registerBuiltinFormats();
  } catch (error) {
    // A failed chunk load must not poison later calls; let the next read retry.
    builtinFormatsModule = null;
    // A collision means another handler already owns the extension (a plugin
    // registered it before any viewer mounted); the resolve below is the
    // decision point. Only chunk-load failures rethrow.
    if (!(error instanceof DuplicateRegistrationError)) {
      throw error;
    }
  }
}

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
      await ensureBuiltinFormats();
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
