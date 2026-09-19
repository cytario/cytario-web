import { z } from "zod";

// pathName is "" for connection-root entries; the action guard collapses empty
// strings to undefined, so default("") restores the root case here.
export const recordViewedSchema = z.object({
  connectionId: z.string().min(1),
  pathName: z.string().optional().default(""),
  name: z.string().min(1),
  type: z.enum(["file", "directory"]),
});
