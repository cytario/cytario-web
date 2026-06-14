import { z } from "zod";

export const addFavoriteSchema = z.object({
  connectionName: z.string().min(1),
  pathName: z.string(),
  displayName: z.string().min(1),
  totalSize: z.coerce.number().optional(),
  lastModified: z.coerce.number().optional(),
});

export const removeFavoriteSchema = z.object({
  connectionName: z.string().min(1),
  pathName: z.string(),
});
