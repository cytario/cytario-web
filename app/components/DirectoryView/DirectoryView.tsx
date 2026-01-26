import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { ReactNode, useEffect } from "react";

import { DirectoryViewGrid } from "./DirectoryViewGrid";
import { DirectoryViewTable } from "./DirectoryViewTable";
import { NodeInfoModal } from "./NodeInfoModal";
import { ButtonLink } from "../Controls/Button";
import { Icon } from "../Controls/IconButton";
import { H1 } from "../Fonts";
import { useDirectoryStore } from "./useDirectoryStore";
import { Container } from "~/components/Container";
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

interface TabProps {
  label: string;
  children: ReactNode;
}

function IconTab({ children, label }: TabProps) {
  return (
    <Tab
      aria-label={label}
      className={`
        flex items-center justify-center
        w-8 h-8
        bg-white
        data-[hover]:bg-slate-300 
        data-[selected]:bg-slate-700 data-[selected]:text-white 
        border border-slate-300
      `}
    >
      {children}
    </Tab>
  );
}

export function DirectoryView({
  nodes,
  name,
  provider,
  bucketName,
  pathName,
}: DirectoryViewProps) {
  const { activeTab, setActiveTab, setProvider, setBucketName, setPathName } =
    useDirectoryStore();

  useEffect(() => {
    if (provider) setProvider(provider);
    setBucketName(bucketName);
    setPathName(pathName);
  }, [provider, bucketName, pathName, setProvider, setBucketName, setPathName]);

  if (nodes.length === 0) {
    return (
      <Container>
        <div>[Placeholder: No items]</div>
      </Container>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* List vs Grid */}
      <TabGroup selectedIndex={activeTab} onChange={setActiveTab}>
        <Container>
          <header className="flex flex-col justify-between mt-24 gap-2">
            {/* Actions */}
            <div className="flex gap-2">
              {name && <H1 className="flex-grow">{name}</H1>}

              {/* Tabs */}
              <TabList className="flex gap-1">
                <IconTab label="List View">
                  <Icon icon="List" size={16} />
                </IconTab>
                <IconTab label="Grid View">
                  <Icon icon="Grid2x2" />
                </IconTab>
              </TabList>
            </div>
            <div>
              {/* Render button only on root */}
              {!bucketName && (
                <ButtonLink to="/connect-bucket" theme="white">
                  <Icon icon="Plug" size={16} /> Connect Bucket
                </ButtonLink>
              )}

              {/* Cyberduck button - only show when viewing a bucket */}
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

        {/* Tab Panels */}
        <TabPanels>
          <TabPanel>
            <DirectoryViewTable nodes={nodes} />
          </TabPanel>
          <TabPanel>
            <Container>
              <DirectoryViewGrid nodes={nodes} />
            </Container>
          </TabPanel>
        </TabPanels>
      </TabGroup>

      {/* Modal */}
      <NodeInfoModal />
    </div>
  );
}
