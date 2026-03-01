import { useState } from "react";
import { Outlet } from "react-router";

import { SidebarPortalProvider } from "~/components/SidebarPortal";

export default function ScrollViewLayout() {
  const [sidebarRef, setSidebarRef] = useState<HTMLDivElement | null>(null);

  return (
    <SidebarPortalProvider value={sidebarRef}>
      <div className="flex h-full">
        <div ref={setSidebarRef} />
        <div className="flex-1 overflow-x-hidden overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </SidebarPortalProvider>
  );
}
