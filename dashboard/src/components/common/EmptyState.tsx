import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Buttons/links, e.g. a primary "Try an example". */
  actions?: ReactNode;
  compact?: boolean;
}

/** Friendly "nothing here yet" panel: an illustrated icon, a line of help, and what to do next. */
export function EmptyState({ icon: Icon, title, description, actions, compact }: EmptyStateProps) {
  return (
    <div className={`empty-illustrated${compact ? " empty-illustrated--compact" : ""}`}>
      <div className="empty-illustrated__art" aria-hidden="true">
        <span className="empty-illustrated__ring empty-illustrated__ring--outer" />
        <span className="empty-illustrated__ring empty-illustrated__ring--inner" />
        <span className="empty-illustrated__icon">
          <Icon size={compact ? 22 : 28} />
        </span>
      </div>
      <h2 className="empty-illustrated__title">{title}</h2>
      <p className="empty-illustrated__description">{description}</p>
      {actions && <div className="empty-illustrated__actions">{actions}</div>}
    </div>
  );
}
