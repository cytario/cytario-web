import { type CSSProperties } from "react";
import { useRouteLoaderData } from "react-router";

import { type UserProfile } from "~/.server/auth/getUserInfo";
import { Breadcrumbs } from "~/components/Breadcrumbs/Breadcrumbs";
import { useLayoutStore } from "~/components/DirectoryView/useLayoutStore";
import { GlobalSearch } from "~/components/GlobalSearch";
import { type NotificationInput } from "~/components/Notification/Notification.store";
import { UserMenu } from "~/components/UserMenu";

/**
 * CSS custom property overrides that recontextualize design tokens for rendering
 * on the dark navy (slate-900) header. Design system components inside this scope
 * (Breadcrumbs, Button, IconButton, Input) automatically get light text, transparent
 * surfaces, and appropriate border/hover colors without per-component className hacks.
 */
const darkSurfaceTokens = {
  "--color-text-primary": "var(--color-neutral-0)",
  "--color-text-secondary": "var(--color-slate-400)",
  "--color-surface-default": "transparent",
  "--color-border-default": "var(--color-slate-700)",
  "--color-border-strong": "var(--color-slate-600)",
  "--color-border-focus": "var(--color-neutral-0)",
  "--color-neutral-100": "var(--color-slate-800)",
  "--color-neutral-200": "var(--color-slate-700)",
  "--color-neutral-300": "var(--color-slate-600)",
  "--color-neutral-400": "var(--color-slate-500)",
} as CSSProperties;

interface RootLoaderResponse {
  user?: UserProfile;
  notification?: NotificationInput;
  accountSettingsUrl?: string;
}

export function AppHeader() {
  const headerSlot = useLayoutStore((s) => s.headerSlot);
  const data = useRouteLoaderData<RootLoaderResponse>("root");

  return (
    <header
      className="z-20 flex justify-between items-center h-12 bg-slate-900 top-0 left-0 right-0"
      style={darkSurfaceTokens}
    >
      <div className="h-full shrink min-w-0">
        <Breadcrumbs />
      </div>

      <div className="hidden xl:block" data-theme="dark">
        {headerSlot}
      </div>

      <div className="h-full flex-none flex gap-2 p-2 items-center">
        <GlobalSearch />
        {data?.accountSettingsUrl && data.user && (
          <UserMenu
            user={data.user}
            accountSettingsUrl={data.accountSettingsUrl}
          />
        )}
      </div>
    </header>
  );
}
