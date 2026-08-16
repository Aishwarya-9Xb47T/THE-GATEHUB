import { Outlet } from "react-router-dom";

export function EditorLayout() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#1e1e1e] text-slate-200">
      <div className="w-full h-full">
        <Outlet />
      </div>
    </div>
  );
}
