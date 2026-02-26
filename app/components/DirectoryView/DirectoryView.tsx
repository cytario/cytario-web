import { useCallback, useEffect } from "react";

import { DirectoryViewGrid } from "./DirectoryViewGrid";
import { DirectoryViewTable } from "./DirectoryViewTable";
import { NodeInfoModal } from "./NodeInfoModal";
import { ViewModeToggle } from "./ViewModeToggle";
import { Button, ButtonLink, Icon } from "../Controls";
import { H1 } from "../Fonts";
import { useDirectoryStore } from "./useDirectoryStore";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";
import { Placeholder } from "~/components/Placeholder";
import { getName } from "~/utils/pathUtils";
import {
  selectIsPinned,
  usePinnedPathsStore,
} from "~/utils/pinnedPathsStore";
import { useRecentlyViewedStore } from "~/utils/recentlyViewedStore/useRecentlyViewedStore";

export interface DirectoryViewBaseProps {
  nodes: TreeNode[];
  provider?: string;
  bucketName: string;
  pathName?: string;
}

interface DirectoryViewProps extends DirectoryViewBaseProps {
  name: string;
  isAdmin?: boolean;
}

export function DirectoryView({
  nodes,
  name,
  provider,
  bucketName,
  pathName,
  isAdmin,
}: DirectoryViewProps) {
  const { viewMode, setProvider, setBucketName, setPathName } =
    useDirectoryStore();

  const { addItem } = useRecentlyViewedStore();
  const isPinned = usePinnedPathsStore(
    selectIsPinned(provider ?? "", bucketName, pathName ?? ""),
  );
  const { addPin, removePin } = usePinnedPathsStore();

  const togglePin = useCallback(() => {
    if (!provider || !bucketName) return;
    const id = `${provider}/${bucketName}/${pathName ?? ""}`;
    if (isPinned) {
      removePin(id);
    } else {
      addPin({
        provider,
        bucketName,
        pathName: pathName ?? "",
        displayName: pathName ? getName(pathName, bucketName) : bucketName,
      });
    }
  }, [provider, bucketName, pathName, isPinned, addPin, removePin]);

  useEffect(() => {
    if (provider) setProvider(provider);
    setBucketName(bucketName);
    setPathName(pathName);

    // Track browsed directories (skip bucket-level landing page)
    if (provider && bucketName && pathName) {
      addItem({
        provider,
        bucketName,
        pathName,
        name,
        type: "directory",
        children: [],
      });
    }
  }, [provider, bucketName, pathName, name, setProvider, setBucketName, setPathName, addItem]);

  if (nodes.length === 0) {
    return (
      <Section>
        <Placeholder
          icon="FolderOpen"
          title="No items found"
          description="This folder is empty or you may not have permission to view its contents."
        />
      </Section>
    );
  }

  return (
    <>
      <Container>
        <header className="flex flex-col justify-between mb-8 gap-2">
          <div className="flex gap-2">
            {name && <H1 className="flex-grow">{name}</H1>}
            <ViewModeToggle />
          </div>
          <div className="flex gap-2">
            {!bucketName && isAdmin && (
              <ButtonLink to="/connect-bucket" theme="white">
                <Icon icon="Plug" size={16} /> Connect Storage
              </ButtonLink>
            )}

            {bucketName && (
              <>
                <Button
                  onClick={togglePin}
                  theme="white"
                  className="gap-2"
                  aria-label={isPinned ? "Unpin directory" : "Pin directory"}
                >
                  <Icon
                    icon={isPinned ? "BookmarkCheck" : "Bookmark"}
                    size={16}
                  />
                  {isPinned ? "Pinned" : "Pin"}
                </Button>
                <ButtonLink
                  to="?action=cyberduck"
                  theme="white"
                  className="gap-2"
                >
                  <Icon icon="Download" size={16} />
                  Access with Cyberduck
                </ButtonLink>
              </>
            )}
          </div>
        </header>
      </Container>

      {viewMode === "list" ? (
        <DirectoryViewTable nodes={nodes} />
      ) : (
        <Container>
          <DirectoryViewGrid nodes={nodes} viewMode={viewMode} />
        </Container>
      )}

      <NodeInfoModal />
    </>
  );
}
