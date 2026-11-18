import type { LocalFileSource } from "@cytario/plugin-api";

/**
 * The hand-off between the header's pick and the local viewer route: the pick
 * holds the File here and navigates; the route registers the viewer against
 * it. A Map keyed by the file name so a second pick of the same name replaces
 * the bytes the previous open used.
 */
const pendingLocalSources = new Map<string, LocalFileSource>();

export function holdLocalSource(fileName: string, source: LocalFileSource): void {
  pendingLocalSources.set(fileName, source);
}

export function takeLocalSource(fileName: string): LocalFileSource | undefined {
  return pendingLocalSources.get(fileName);
}
