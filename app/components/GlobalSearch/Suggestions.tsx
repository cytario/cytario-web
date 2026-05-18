import { EmptyState, H2 } from "@cytario/design";
import { Loader2, SearchX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { TreeNode } from "../DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "../DirectoryView/DirectoryViewTree";

interface SuggestionsProps {
  nodes: TreeNode[];
  showResults: boolean;
  isLoading: boolean;
}

// Render order: prefer stale nodes over the empty state while a new query is in
// flight — otherwise the dropdown flashes "No results" on every keystroke.
export const Suggestions = ({ nodes, showResults, isLoading }: SuggestionsProps) => {
  return (
    <AnimatePresence>
      {showResults && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: "easeIn" }}
          className={`
            z-10 absolute top-12 right-0
            max-h-[calc(100vh-4rem)]
            min-w-80
            flex flex-col
            overflow-hidden
            bg-white/80 backdrop-blur-lg
            text-black
            shadow-lg rounded-sm border border-slate-200
          `}
          aria-busy={isLoading}
        >
          {nodes.length > 0 ? (
            <>
              <header className="flex-shrink-0 p-4 border-b border-slate-200 flex items-center justify-between">
                <H2>All Results</H2>
                {isLoading && (
                  <Loader2
                    size={16}
                    className="animate-spin text-slate-500"
                    aria-label="Searching"
                  />
                )}
              </header>
              <div className="overflow-y-auto flex-1">
                <DirectoryTree nodes={nodes} />
              </div>
            </>
          ) : isLoading ? (
            <EmptyState
              icon={Loader2}
              title="Searching…"
              description="Looking across your connections."
            />
          ) : (
            <EmptyState
              icon={SearchX}
              title="No results found"
              description="Try adjusting your search criteria or filters."
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
