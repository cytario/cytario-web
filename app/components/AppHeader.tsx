import { useRouteLoaderData } from "react-router";

import { type UserProfile } from "~/.server/auth/getUserInfo";
import { Breadcrumbs } from "~/components/Breadcrumbs/Breadcrumbs";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { PanelToggle } from "~/components/Sidebar/PanelToggle";
import { UserMenu } from "~/components/UserMenu";

interface RootLoaderResponse {
  user?: UserProfile;
  notification?: NotificationInput;
  accountSettingsUrl?: string;
}

export function AppHeader() {
  const headerSlot = useLayoutStore((s) => s.headerSlot);
  const data = useRouteLoaderData<RootLoaderResponse>("root");

  // Real dark theme (not hand-rolled token overrides) so header components
  // resolve the canonical dark palette — same as every other dark surface.
  return (
    <header
      data-theme="dark"
      className={`
        z-20 top-0 left-0 right-0
        flex justify-between items-center 
        h-12 
        bg-background text-muted-foreground 
      `}
    >
      <div className="h-full flex items-center gap-1 shrink min-w-0 pl-2">
        <PanelToggle />
        <Breadcrumbs />
      </div>

      <div className="hidden xl:block">{headerSlot}</div>

      <div className="h-full flex-none flex gap-2 p-2 items-center">
        {data?.accountSettingsUrl && data.user && (
          <UserMenu user={data.user} accountSettingsUrl={data.accountSettingsUrl} />
        )}
      </div>
    </header>
  );
}
