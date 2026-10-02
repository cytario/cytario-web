import {
  IconButton,
  Menu,
  MenuHeader,
  MenuItem,
  MenuSection,
  MenuSeparator,
  SegmentedControl,
  SegmentedControlItem,
} from "@cytario/design";

import { UserProfile } from "~/.server/auth/getUserInfo";
import { ScopePill } from "~/components/Pills/ScopePill";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";
import { useThemeStore, type Theme } from "~/utils/themeStore";

interface UserMenuProps {
  user: UserProfile;
  accountSettingsUrl: string;
  portalUrl?: string;
}

const themeOptions: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export function UserMenu({ user, accountSettingsUrl, portalUrl }: UserMenuProps) {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <Menu
      content={
        <>
          <MenuHeader>
            <div className="px-2 py-1 text-sm">
              <div className="font-semibold">
                {user.given_name} {user.family_name}
              </div>
              <div className="text-muted-foreground">{user.email}</div>
            </div>
          </MenuHeader>

          <MenuSeparator />

          <MenuSection header="Theme">
            <div className="flex justify-center px-3 py-2">
              <SegmentedControl
                aria-label="Color theme"
                selectionMode="single"
                size="sm"
                selectedKeys={new Set([theme])}
                onSelectionChange={(keys) => {
                  const key = [...keys][0];
                  if (key === "light" || key === "dark") setTheme(key);
                }}
              >
                {themeOptions.map(({ id, label }) => (
                  <SegmentedControlItem key={id} id={id}>
                    {label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
            </div>
          </MenuSection>

          <MenuSeparator />

          {user.adminScopes.length > 0 && (
            <>
              <MenuSection header="Admin Groups">
                {user.adminScopes.map((scope) => (
                  <MenuItem
                    key={scope}
                    id={`admin-${scope}`}
                    href={`/admin/users?scope=${encodeURIComponent(scope)}`}
                  >
                    <ScopePill scope={scope} />
                  </MenuItem>
                ))}
              </MenuSection>
              <MenuSeparator />
            </>
          )}

          {user.groups.length > 0 && (
            <>
              <MenuSection header="Groups">
                {user.groups.map((group) => (
                  <MenuItem
                    key={group}
                    id={`group-${group}`}
                    className="hover:bg-transparent focus:bg-transparent cursor-default"
                  >
                    <ScopePill scope={group} />
                  </MenuItem>
                ))}
              </MenuSection>
              <MenuSeparator />
            </>
          )}

          {portalUrl && user.adminScopes.includes(ORG_ROOT_SCOPE) && (
            <MenuItem id="admin-portal" icon="ExternalLink" href={portalUrl} target="_blank">
              Admin Portal
            </MenuItem>
          )}

          <MenuItem id="account-settings" icon="Settings" href={accountSettingsUrl} target="_blank">
            Account Settings
          </MenuItem>
          <MenuItem id="logout" icon="LogOut" href="/logout">
            Logout
          </MenuItem>
        </>
      }
    >
      <IconButton icon="User" label="User menu" variant="ghost" size="sm" />
    </Menu>
  );
}
