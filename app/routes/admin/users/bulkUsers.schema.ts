import { z } from "zod";

export const bulkActionSchema = z
  .object({
    intent: z.enum([
      "addToGroup",
      "removeFromGroup",
      "enableAccounts",
      "disableAccounts",
    ]),
    userIds: z.string().transform((val) => val.split(",")),
    groupId: z.string().optional(),
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
