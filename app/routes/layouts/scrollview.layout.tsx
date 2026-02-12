import { Outlet } from "react-router";

export default function ScrollViewLayout() {
  return (
    <main className="h-full overflow-x-hidden overflow-y-auto">
      <Outlet />
    </main>
  );
}
