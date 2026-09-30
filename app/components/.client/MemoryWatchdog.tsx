import { useToast } from "@cytario/design";
import { useEffect } from "react";

import { startMemoryWatchdog } from "~/utils/memoryWatchdog";

/** Polls Chromium heap stats; on confirmed pressure, trims caches and toasts. */
export function MemoryWatchdog() {
  const { toast } = useToast();

  useEffect(() => {
    return startMemoryWatchdog({
      onPressure: () => {
        toast({
          variant: "info",
          message:
            "Memory pressure detected — cached image data was released to keep the tab responsive. It will reload on demand.",
        });
        import("~/utils/db/cacheTrim").then(({ trimCaches }) => void trimCaches());
      },
    });
  }, [toast]);

  return null;
}
