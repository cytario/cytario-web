import { ButtonLink } from "@cytario/design";
import { Download, Plug } from "lucide-react";
import { useEffect } from "react";


import { DirectoryViewGrid } from "./DirectoryViewGrid";
import { DirectoryViewTable } from "./DirectoryViewTable";
import { NodeInfoModal } from "./NodeInfoModal";
import { useDirectoryStore } from "./useDirectoryStore";
import { ViewModeToggle } from "./ViewModeToggle";
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
            {name && (
              <h1 className="flex-grow font-bold text-2xl sm:text-3xl md:text-4xl">
                {name}
              </h1>
            )}
            <ViewModeToggle />
          </div>
          <div>
            {!bucketName && (
              <ButtonLink
                href="/connect-bucket"
                variant="secondary"
                iconLeft={Plug}
              >
                Connect Storage
              </ButtonLink>
            )}

            {bucketName && (
              <ButtonLink
                href="?action=cyberduck"
                variant="secondary"
                iconLeft={Download}
              >
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
          <DirectoryViewGrid nodes={nodes} viewMode={viewMode} />
        </Container>
      )}

      <NodeInfoModal />
    </>
  );
}
