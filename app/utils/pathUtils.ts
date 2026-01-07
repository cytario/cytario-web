export function getPrefix(path?: string) {
  if (!path) return undefined;
  if (path.endsWith("/")) return path;
  return path + "/";
}

export function getName(path?: string, bucketName?: string): string {
  if (!path) return bucketName ?? "";
  // Strip trailing slashes to handle directory paths correctly
  const normalized = path.replace(/\/+$/, "");
  return normalized.split("/").pop() ?? "";
}
