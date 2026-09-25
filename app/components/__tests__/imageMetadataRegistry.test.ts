import { imageMetadataRegistry } from "../imageMetadataRegistry";
import type { ImageMetadata } from "@cytario/plugin-api";

const capability: ImageMetadata = {
  read: async () => null,
  size: async () => null,
};

afterEach(() => {
  imageMetadataRegistry.__reset();
});

describe("imageMetadataRegistry", () => {
  test("returns null before set()", () => {
    expect(imageMetadataRegistry.scopedFor().get()).toBeNull();
  });

  test("returns the instance after set()", () => {
    imageMetadataRegistry.set(capability);
    expect(imageMetadataRegistry.scopedFor().get()).toBe(capability);
  });

  test("scopedFor returns a fresh view over the same instance", () => {
    imageMetadataRegistry.set(capability);
    const scoped = imageMetadataRegistry.scopedFor();
    expect(scoped.get()).toBe(capability);
    const second = imageMetadataRegistry.scopedFor();
    expect(second.get()).toBe(scoped.get());
  });

  test("__reset clears the instance", () => {
    imageMetadataRegistry.set(capability);
    imageMetadataRegistry.__reset();
    expect(imageMetadataRegistry.scopedFor().get()).toBeNull();
  });
});
