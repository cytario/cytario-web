export const downloadFilenameFor = (name: string, pathName: string): string => {
  const ext = pathName.match(/(\.[a-z0-9]+)$/i)?.[1] ?? "";
  return !ext || name.endsWith(ext) ? name : name + ext;
};
