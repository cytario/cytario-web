import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";

import { Icon } from "./Controls";

interface UserMenuProps {
  accountSettingsUrl: string;
}

export function UserMenu({ accountSettingsUrl }: UserMenuProps) {
  return (
    <Menu>
      <MenuButton
        className="flex place-items-center place-content-center flex-shrink-0 w-8 h-8 rounded-sm border border-slate-500 text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
        aria-label="User menu"
      >
        <Icon icon="User" />
      </MenuButton>

      <MenuItems
        anchor="bottom end"
        className="w-52 origin-top-right rounded-sm border border-slate-500 bg-slate-950 p-1 text-sm text-white shadow-lg focus:outline-none mt-1"
      >
        <MenuItem>
          {({ focus }) => (
            <a
              href={accountSettingsUrl}
              className={`group flex w-full items-center rounded-sm px-3 py-2 ${
                focus ? "bg-slate-800" : ""
              }`}
            >
              Account Settings
            </a>
          )}
        </MenuItem>

        <MenuItem>
          {({ focus }) => (
            <a
              href="/logout"
              className={`group flex w-full items-center rounded-sm px-3 py-2 ${
                focus ? "bg-slate-800" : ""
              }`}
            >
              Logout
            </a>
          )}
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}
