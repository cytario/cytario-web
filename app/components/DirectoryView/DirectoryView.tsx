import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { ReactNode, useEffect } from "react";

import DirectoryViewGrid from "./DirectoryViewGrid";
import DirectoryViewTable from "./DirectoryViewTable";
import { NodeInfoModal } from "./NodeInfoModal";
import { ButtonLink } from "../Controls/Button";
import { Icon } from "../Controls/IconButton";
import { H1 } from "../Fonts";
import { useDirectoryStore } from "./useDirectoryStore";
import { InputGroup } from "../Controls/InputGroup";
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
        flex items-center 
        p-2
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

export default function DirectoryView({
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
    <Container>
      {/* List vs Grid */}
      <TabGroup selectedIndex={activeTab} onChange={setActiveTab}>
        <header className="flex justify-between mb-4">
          {name && <H1>{name}</H1>}
          <div className="flex items-center gap-2">
            {/* Render button only on root */}
            {!bucketName && (
              <ButtonLink to="/connect-bucket" theme="white">
                Connect Bucket
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
            {/* Tabs */}
            <TabList className="flex">
              <InputGroup>
                <IconTab label="List View">
                  <Icon icon="List" size={16} />
                </IconTab>
                <IconTab label="Grid View">
                  <Icon icon="Grid2x2" size={16} />
                </IconTab>
              </InputGroup>
            </TabList>
          </div>
        </header>

        {/* Tab Panels */}
        <TabPanels>
          <TabPanel>
            <DirectoryViewTable nodes={nodes} />
          </TabPanel>
          <TabPanel>
            <DirectoryViewGrid nodes={nodes} />
          </TabPanel>
        </TabPanels>
      </TabGroup>

      {/* Modal */}
      <NodeInfoModal />
    </Container>
  );
}
