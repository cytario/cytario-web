import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";

import { ButtonLink, IconButton } from "./Controls";
import { UserProfile } from "~/.server/auth/getUserInfo";

interface UserMenuProps {
  user: UserProfile;
  accountSettingsUrl: string;
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

        {/* Groups*/}
        <div className="text-sm space-y-1 bg-slate-700 p-2 rounded-sm">
          <div className="font-bold">Groups</div>
          {user.groups.map((g) => (
            <div key={g}>{g}</div>
          ))}
        </div>

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
