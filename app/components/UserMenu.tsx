import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { ReactNode } from "react";
import { Link } from "react-router";

import { ButtonLink, IconButton } from "./Controls";
import { UserProfile } from "~/.server/auth/getUserInfo";

interface UserMenuProps {
  user: UserProfile;
  accountSettingsUrl: string;
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="text-sm space-y-1 bg-slate-700 p-2 border border-slate-500 rounded-sm flex flex-col">
      {children}
    </div>
  );
}

export function UserMenu({ user, accountSettingsUrl }: UserMenuProps) {
  return (
    <Menu>
      <MenuButton as={IconButton} icon="User" label="User Menu" />

      <MenuItems
        anchor="top end"
        className={`
        z-20 min-w-80
        space-y-2 p-2 mt-2
        bg-slate-950 text-white 
        rounded-b shadow-lg
        focus:outline-none 
      `}
      >
        {/* Name & Email */}
        <div>
          <div className="font-bold">
            {user.given_name} {user.family_name}
          </div>

          <div>{user.email}</div>
        </div>

        {/* Admin Groups */}
        {user.adminScopes.length > 0 && (
          <Card>
            <div className="font-bold">Admin Groups</div>
            {user.adminScopes.map((scope) => (
              <Link
                key={scope}
                to={`/admin/users?scope=${encodeURIComponent(scope)}`}
                className="hover:underline"
              >
                {scope}
              </Link>
            ))}
          </Card>
        )}

        {/* Groups*/}
        <Card>
          <div className="font-bold">Groups</div>
          {user.groups.map((g) => (
            <div key={g}>{g}</div>
          ))}
        </Card>

        {/* Menu Items */}
        <MenuItem
          as={ButtonLink}
          to={accountSettingsUrl}
          className="w-full data-[focus]:bg-slate-700"
        >
          Account Settings
        </MenuItem>

        <MenuItem
          as={ButtonLink}
          to={"/logout"}
          className="w-full data-[focus]:bg-slate-700"
        >
          Logout
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
