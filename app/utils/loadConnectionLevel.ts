import type {
  LoadConnectionLevelArgs,
  LoadConnectionLevelResult,
} from "~/utils/connectionsStore/useConnectionTreeStore";
import { useConnectionTreeStore } from "~/utils/connectionsStore/useConnectionTreeStore";

export type { LoadConnectionLevelArgs, LoadConnectionLevelResult };

/** Loads one connection level through the per-connection tree cache. */
export function loadConnectionLevel(
  args: LoadConnectionLevelArgs,
): Promise<LoadConnectionLevelResult> {
  return useConnectionTreeStore.getState().loadLevel(args);
}
