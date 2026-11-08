import { FileText, Plug, Puzzle, UserRound, X, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useProviderConnections } from "../../context/ProviderConnectionsContext";
import { Skeleton } from "../common/Skeleton";
import { ProviderLogo } from "../connectors/ProviderLogo";
import { ThemeToggle } from "./ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Your details",
    items: [
      { to: "/", label: "Profile", icon: UserRound, end: true },
      { to: "/resumes", label: "Resumes", icon: FileText },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/extension", label: "Extension", icon: Puzzle },
      { to: "/connectors", label: "Agent connectors", icon: Plug },
    ],
  },
];

interface AppSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AppSidebar({ isOpen, onClose }: AppSidebarProps) {
  const { activeStatus, activeModel, connectedCount, providers } = useProviderConnections();
  const totalProviders = providers.statuses.length;

  return (
    <aside className={`sidebar${isOpen ? " sidebar--open" : ""}`} aria-label="Main navigation">
      <div className="sidebar__brand">
        <span className="sidebar__logo" aria-hidden="true">A</span>
        <div>
          <div className="sidebar__product">Apply Copilot</div>
          <div className="sidebar__tagline">Job application autofill</div>
        </div>
        <button type="button" className="icon-button sidebar__close" onClick={onClose} aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <nav className="sidebar__nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="sidebar__section">
            <div className="sidebar__section-title">{section.title}</div>
            <ul>
              {section.items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onClose}
                    className={({ isActive }) => `sidebar__link${isActive ? " sidebar__link--active" : ""}`}
                  >
                    <Icon size={18} />
                    <span>{label}</span>
                    {to === "/connectors" && totalProviders > 0 && (
                      <span className="sidebar__count" title="Connected providers">
                        {connectedCount}/{totalProviders}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <ThemeToggle />
        <NavLink to="/connectors" onClick={onClose} className="active-model-chip">
          {activeStatus ? (
            <>
              <ProviderLogo providerId={activeStatus.provider_id} size={30} />
              <div className="active-model-chip__text">
                <span className="active-model-chip__label">AI model</span>
                <span className="active-model-chip__name">
                  {activeStatus.display_name}
                  <span className="muted"> · {activeModel || activeStatus.default_model}</span>
                </span>
              </div>
              <span
                className={`status-dot${activeStatus.is_ready ? " status-dot--good" : " status-dot--off"}`}
                title={activeStatus.is_ready ? "Connected" : "Not connected"}
              />
            </>
          ) : (
            <span className="active-model-chip__loading" role="status" aria-label="Checking connectors">
              <Skeleton width={30} height={30} radius={8} className="skeleton-block--on-dark" />
              <span className="active-model-chip__text">
                <Skeleton width={70} height={9} className="skeleton-block--on-dark" />
                <Skeleton width={130} height={12} className="skeleton-block--on-dark" />
              </span>
            </span>
          )}
        </NavLink>
      </div>
    </aside>
  );
}
