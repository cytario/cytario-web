import { Outlet } from "react-router";

export default function ScrollViewLayout() {
  return (
    <div className="max-h-full overflow-x-hidden overflow-y-auto">
      <Outlet />
    </div>
  );
}
