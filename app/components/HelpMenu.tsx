import { IconButton, Menu, MenuItem, MenuSection, MenuSeparator } from "@cytario/design";
import { useLocation, useRouteLoaderData } from "react-router";

import { isResourcePath, leafNameOf, type TourDefinition } from "~/components/Tour/tourRegistry";
import { tourRegistry } from "~/components/Tour/tours/registry";
import { useTourController } from "~/components/Tour/useTourController";

interface HelpMenuProps {
  version: string;
  docsUrl?: string;
  supportEmail?: string;
}

interface ProtectedLayoutData {
  connectionConfigs?: unknown[];
}

const GUIDED_TOURS_SECTION = "Guided tours";

export function HelpMenu({ version, docsUrl, supportEmail }: HelpMenuProps) {
  const { startTour } = useTourController();
  const { pathname } = useLocation();
  const protectedData = useRouteLoaderData<ProtectedLayoutData>("routes/layouts/protected.layout");
  const connectionCount = protectedData?.connectionConfigs?.length ?? 0;

  // Derived from the registry, so a new tour appears here without a change to
  // this component. Entries are filtered by what the current screen supports.
  const availableTours = tourRegistry.filter((tour: TourDefinition) =>
    tour.isAvailable({
      pathname,
      leafName: isResourcePath(pathname) ? leafNameOf(pathname) : "",
      connectionCount,
    }),
  );

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
          {availableTours.length > 0 && (
            <MenuSection header={GUIDED_TOURS_SECTION} aria-label={GUIDED_TOURS_SECTION}>
              {availableTours.map((tour) => (
                <MenuItem
                  key={tour.id}
                  id={`tour-${tour.id}`}
                  icon="MapPin"
                  onAction={() => startTour(tour.id)}
                >
                  {tour.menuLabel}
                </MenuItem>
              ))}
            </MenuSection>
          )}
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
