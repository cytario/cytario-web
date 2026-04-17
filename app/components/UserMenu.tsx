import {
  IconButton,
  Menu,
  MenuHeader,
  MenuItem,
  MenuSection,
  MenuSeparator,
} from "@cytario/design";
import { LogOut, Settings, Shield, User, Users } from "lucide-react";

import { UserProfile } from "~/.server/auth/getUserInfo";
import { ScopePill } from "~/components/Pills/ScopePill";

interface UserMenuProps {
  user: UserProfile;
  accountSettingsUrl: string;
}

export function UserMenu({ user, accountSettingsUrl }: UserMenuProps) {
  return (
    <Menu
      content={
        <>
          <MenuHeader>
            <div className="px-2 py-1 text-sm">
              <div className="font-semibold">
                {user.given_name} {user.family_name}
              </div>
              <div className="text-[var(--color-text-secondary)]">
                {user.email}
              </div>
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
                    icon={Shield}
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
                  <MenuItem key={group} id={`group-${group}`} icon={Users}>
                    <ScopePill scope={group} />
                  </MenuItem>
                ))}
              </MenuSection>
              <MenuSeparator />
            </>
          )}

          <MenuItem
            id="account-settings"
            icon={Settings}
            href={accountSettingsUrl}
            target="_blank"
          >
            Account Settings
          </MenuItem>
          <MenuItem id="logout" icon={LogOut} href="/logout">
            Logout
          </MenuItem>
        </>
      }
    >
      <IconButton
        icon={User}
        aria-label="User menu"
        variant="ghost"
        className="flex-shrink-0 w-8 h-8 text-white hover:bg-white/15 pressed:bg-white/20"
      />
    </Menu>
  );
}
