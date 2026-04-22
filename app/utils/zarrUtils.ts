/**
 * Check if a URL or path points to a zarr image.
 * Matches paths containing .zarr as a complete extension segment
 * (followed by /, end of string, or query parameter).
 */
export function isZarrPath(urlOrPath: string): boolean {
  return /\.zarr(\/|$|\?)/.test(urlOrPath);
}
