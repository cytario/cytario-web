import { EmptyState, H2 } from "@cytario/design";
import { SearchX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { TreeNode } from "../DirectoryView/buildDirectoryTree";
import { DirectoryViewTree } from "../DirectoryView/DirectoryViewTree";

interface SuggestionsProps {
  nodes: TreeNode[];
  showResults: boolean;
}
export const Suggestions = ({ nodes, showResults }: SuggestionsProps) => {

  return (
    <AnimatePresence>
      {showResults && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2, ease: "easeIn" }}
          data-theme="light"
          className={`
            z-10 absolute top-12 right-0
            max-h-[calc(100vh-4rem)]
            min-w-80
            flex flex-col
            overflow-hidden
            bg-white/80 backdrop-blur-lg
            shadow-lg rounded-sm border border-slate-200
          `}
        >
          {nodes.length > 0 ? (
            <>
              <header className="flex-shrink-0 p-4 border-b border-slate-200">
                <H2>All Results</H2>
              </header>
              <div className="overflow-y-auto flex-1">
                <DirectoryViewTree nodes={nodes} autoHeight openByDefault={false} size="compact" />
              </div>
            </>
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
