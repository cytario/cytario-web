export function getPrefix(path?: string) {
  if (!path) return undefined;
  if (path.endsWith("/")) return path;
  return path + "/";
}

export function getName(path?: string, bucketName?: string): string {
  if (!path) return bucketName ?? "";
  return path.split("/").pop() ?? "";
}
