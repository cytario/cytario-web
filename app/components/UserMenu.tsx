import {
  IconButton,
  Menu,
  MenuHeader,
  MenuItem,
  MenuSection,
  MenuSeparator,
} from "@cytario/design";

import { UserProfile } from "~/.server/auth/getUserInfo";
import { ScopePill } from "~/components/Pills/ScopePill";
import { ORG_ROOT_SCOPE } from "~/utils/authorization";

interface UserMenuProps {
  user: UserProfile;
  accountSettingsUrl: string;
  portalUrl?: string;
}

export function UserMenu({ user, accountSettingsUrl, portalUrl }: UserMenuProps) {
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
