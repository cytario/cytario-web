import { Outlet } from "react-router";

export default function ScrollViewLayout() {
  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-x-hidden overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
