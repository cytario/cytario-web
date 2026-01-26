import { Transition } from "@headlessui/react";

import {
  buildDirectoryTree,
  TreeNode,
} from "../DirectoryView/buildDirectoryTree";
import { DirectoryTree } from "../DirectoryView/DirectoryViewTree";
import { H2 } from "../Fonts";
import { Placeholder } from "../Placeholder";
import { GlobalSearchResults } from "./GlobalSearch";
import { ObjectPresignedUrl } from "~/routes/objects.route";

interface SuggestionsProps {
  results: GlobalSearchResults;
  showResults: boolean;
}
export const Suggestions = ({
  results: { files },
  showResults,
}: SuggestionsProps) => {
  const nodes: TreeNode[] = Object.keys(files).map((bucketName) => {
    return {
      bucketName,
      name: bucketName,
      type: "bucket",
      children: buildDirectoryTree(
        bucketName,
        files[bucketName] as ObjectPresignedUrl[]
      ),
    };
  });

  return (
    <Transition show={showResults}>
      <div
        className={`
          z-10 absolute top-12 right-0
          max-h-[calc(100vh-4rem)]
          min-w-80
          flex flex-col
          overflow-hidden
          bg-white/80 backdrop-blur-lg
          text-black
          shadow-lg rounded-sm border
          transition duration-200 ease-in
          data-[closed]:opacity-0
          data-[closed]:-translate-y-1
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
            {/* {
              <footer className="flex-shrink-0 p-4 border-t">
                <ButtonLink to={`/search?query=${searchString}`}>All</ButtonLink>
              </footer>
            } */}
          </>
        ) : (
          <Placeholder
            icon="SearchX"
            title="No results found"
            description="Try adjusting your search criteria or filters."
          />
        )}
      </div>
    </Transition>
  );
};
