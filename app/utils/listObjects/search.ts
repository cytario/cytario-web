export const search = (query: string, source?: string) => {
  if (!source || query.trim() === "") return false;
  return source.toLowerCase().includes(query.toLowerCase());
};
