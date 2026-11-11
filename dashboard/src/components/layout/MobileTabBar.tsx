import { FileText, Menu, Plug, Puzzle, UserRound, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

const TABS: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: "/", label: "Profile", icon: UserRound, end: true },
  { to: "/resumes", label: "Resumes", icon: FileText },
  { to: "/extension", label: "Extension", icon: Puzzle },
  { to: "/connectors", label: "Models", icon: Plug },
];

/** Phone-only bottom navigation; "More" opens the full sidebar (theme and model status). */
export function MobileTabBar({ onOpenMore }: { onOpenMore: () => void }) {
  return (
    <nav className="mobile-tabbar" aria-label="Quick navigation">
      {TABS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `mobile-tabbar__tab${isActive ? " mobile-tabbar__tab--active" : ""}`}
        >
          <Icon size={20} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
      <button type="button" className="mobile-tabbar__tab" onClick={onOpenMore}>
        <Menu size={20} aria-hidden="true" />
        <span>More</span>
      </button>
    </nav>
  );
}
