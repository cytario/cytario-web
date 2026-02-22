import { IconButton, Menu, type MenuItemData } from "@cytario/design";
import { LogOut, Settings, User } from "lucide-react";

import { UserProfile } from "~/.server/auth/getUserInfo";

interface UserMenuProps {
  user: UserProfile;
  accountSettingsUrl: string;
}

export function UserMenu({ accountSettingsUrl }: UserMenuProps) {
  const items: MenuItemData[] = [
    {
      id: "account-settings",
      label: "Account Settings",
      icon: Settings,
      href: accountSettingsUrl,
      target: "_blank",
    },
    {
      id: "logout",
      label: "Logout",
      icon: LogOut,
      href: "/logout",
    },
  ];

  return (
    <Menu items={items}>
      <IconButton
        icon={User}
        aria-label="User menu"
        variant="ghost"
        className="flex-shrink-0 w-8 h-8 text-white"
      />
    </Menu>
  );
}
