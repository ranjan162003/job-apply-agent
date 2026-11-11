import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { AppSidebar } from "./AppSidebar";
import { MobileTabBar } from "./MobileTabBar";

/**
 * Sidebar + main content area. On phones the sidebar becomes a slide-in drawer,
 * opened from "More" in the bottom tab bar.
 */
export function AppShell() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  // Animate when switching pages, not when a sub-route changes inside one page.
  const section = pathname.split("/")[1] || "profile";

  return (
    <div className="app-shell">
      <AppSidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {isSidebarOpen && <div className="app-shell__scrim" onClick={() => setIsSidebarOpen(false)} />}

      <div className="app-shell__main">
        <header className="mobile-topbar">
          <span className="sidebar__logo mobile-topbar__logo" aria-hidden="true">A</span>
          <span className="mobile-topbar__title">Apply Copilot</span>
        </header>
        <main className="app-content">
          <div key={section} className="page-transition">
            <Outlet />
          </div>
        </main>
      </div>
      <MobileTabBar onOpenMore={() => setIsSidebarOpen(true)} />
    </div>
  );
}
