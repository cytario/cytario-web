import { Tab, TabList } from "@cytario/design";

interface TabStripProps {
  showViewerTab: boolean;
}

// Must render inside <Tabs> for tablist context.
export function TabStrip({ showViewerTab }: TabStripProps) {
  return (
    <TabList aria-label="Sidebar sections">
      <Tab id="explorer">Explorer</Tab>
      {showViewerTab ? <Tab id="viewer">Viewer</Tab> : null}
    </TabList>
  );
}
