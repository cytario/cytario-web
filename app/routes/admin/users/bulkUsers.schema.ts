import { z } from "zod";

export const bulkActionSchema = z
  .object({
    intent: z.enum([
      "addToGroup",
      "removeFromGroup",
      "enableAccounts",
      "disableAccounts",
    ]),
    userIds: z
      .string()
      .min(1, "At least one user is required")
      .transform((val) => val.split(","))
      .pipe(z.array(z.string().uuid()).max(500)),
    groupId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.intent === "addToGroup" || data.intent === "removeFromGroup") {
        return !!data.groupId;
      }
      return true;
    },
    { message: "groupId is required for group operations", path: ["groupId"] },
  );

export type BulkActionData = z.infer<typeof bulkActionSchema>;
