import { useEffect } from "react";

import { DirectoryViewGrid } from "./DirectoryViewGrid";
import { DirectoryViewTable } from "./DirectoryViewTable";
import { NodeInfoModal } from "./NodeInfoModal";
import { ViewModeToggle } from "./ViewModeToggle";
import { ButtonLink, Icon } from "../Controls";
import { H1 } from "../Fonts";
import { useDirectoryStore } from "./useDirectoryStore";
import { Container, Section } from "~/components/Container";
import { TreeNode } from "~/components/DirectoryView/buildDirectoryTree";

export interface DirectoryViewBaseProps {
  nodes: TreeNode[];
  provider?: string;
  bucketName: string;
  pathName?: string;
}

interface DirectoryViewProps extends DirectoryViewBaseProps {
  name: string;
}

export function DirectoryView({
  nodes,
  name,
  provider,
  bucketName,
  pathName,
}: DirectoryViewProps) {
  const { viewMode, setProvider, setBucketName, setPathName } =
    useDirectoryStore();

  useEffect(() => {
    if (provider) setProvider(provider);
    setBucketName(bucketName);
    setPathName(pathName);
  }, [provider, bucketName, pathName, setProvider, setBucketName, setPathName]);

  if (nodes.length === 0) {
    return (
      <Section>
        <div>[Placeholder: No items]</div>
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
          <div>
            {!bucketName && (
              <ButtonLink to="/connect-bucket" theme="white">
                <Icon icon="Plug" size={16} /> Connect Storage
              </ButtonLink>
            )}

            {bucketName && (
              <ButtonLink
                to="?action=cyberduck"
                theme="white"
                className="gap-2"
              >
                <Icon icon="Download" size={16} />
                Access with Cyberduck
              </ButtonLink>
            )}
          </div>
        </header>
      </Container>

      {viewMode === "list" ? (
        <DirectoryViewTable nodes={nodes} />
      ) : (
        <Container>
          <DirectoryViewGrid
            nodes={nodes}
            size={viewMode === "grid-lg" ? "lg" : viewMode === "grid-md" ? "md" : "sm"}
          />
        </Container>
      )}

      <NodeInfoModal />
    </>
  );
}
