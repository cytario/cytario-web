import { IconButton, Menu, MenuItem, MenuSeparator } from "@cytario/design";

import { useTourController } from "~/components/Tour/useTourController";

interface HelpMenuProps {
  version: string;
  docsUrl?: string;
  supportEmail?: string;
}

export function HelpMenu({ version, docsUrl, supportEmail }: HelpMenuProps) {
  const { startTour } = useTourController();

  return (
    <Menu
      content={
        <>
          {docsUrl && (
            <MenuItem id="docs" icon="ExternalLink" href={docsUrl} target="_blank">
              Documentation
            </MenuItem>
          )}
          {supportEmail && (
            <MenuItem id="support" icon="Mail" href={`mailto:${supportEmail}`}>
              Contact Support
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem id="tour" icon="MapPin" onAction={() => startTour("getting-started")}>
            Take the tour
          </MenuItem>
          <MenuItem id="version" href="/config">
            Version {version}
          </MenuItem>
        </>
      }
    >
      <IconButton icon="CircleHelp" label="Help" variant="ghost" size="sm" />
    </Menu>
  );
}
