import { z } from "zod";

export const recordViewedSchema = z.object({
  connectionName: z.string().min(1),
  pathName: z.string(),
  name: z.string().min(1),
  type: z.enum(["file", "directory"]),
});
