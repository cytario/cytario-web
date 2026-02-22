import { EmptyState, H2 } from "@cytario/design";
import { SearchX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { TreeNode } from "../DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "../DirectoryView/DirectoryViewTree";

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
          className={`
            z-10 absolute top-12 right-0
            max-h-[calc(100vh-4rem)]
            min-w-80
            flex flex-col
            overflow-hidden
            bg-white/80 backdrop-blur-lg
            text-black
            shadow-lg rounded-sm border
          `}
        >
          {nodes.length > 0 ? (
            <>
              <header className="flex-shrink-0 p-4 border-b">
                <H2>All Results</H2>
              </header>
              <div className="overflow-y-auto flex-1">
                <DirectoryTree nodes={nodes} />
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
