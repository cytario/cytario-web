import type { ImageMetadata, ImageMetadataRegistry } from "@cytario/plugin-api";

class ImageMetadataRegistryImpl {
  private instance: ImageMetadata | null = null;

  set(instance: ImageMetadata): void {
    this.instance = instance;
  }

  scopedFor(): ImageMetadataRegistry {
    return {
      get: () => this.instance,
    };
  }

  __reset(): void {
    this.instance = null;
  }
}

export const imageMetadataRegistry = new ImageMetadataRegistryImpl();

export type { ImageMetadataRegistryImpl };
