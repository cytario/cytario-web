import { z } from "zod";

// pathName is "" for connection-root favorites. The action guard collapses
// empty strings to undefined, so default("") restores the root case here.
export const addFavoriteSchema = z.object({
  connectionId: z.string().min(1),
  pathName: z.string().optional().default(""),
  displayName: z.string().min(1),
  totalSize: z.coerce.number().optional(),
  lastModified: z.coerce.number().optional(),
});

export const removeFavoriteSchema = z.object({
  connectionId: z.string().min(1),
  pathName: z.string().optional().default(""),
});
