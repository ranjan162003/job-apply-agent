interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number;
  className?: string;
}

/** A shimmering placeholder block shown while real content loads, so the layout doesn't jump. */
export function Skeleton({ width = "100%", height = 14, radius = 6, className }: SkeletonProps) {
  return (
    <span
      className={`skeleton-block${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  );
}

/** A few placeholder rows shaped like a list (history, watchlist, chats). */
export function SkeletonList({ rows = 4, label = "Loading…" }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-list__row">
          <Skeleton width="45%" height={14} />
          <Skeleton width={`${80 - (i % 3) * 12}%`} height={12} />
          <Skeleton width="35%" height={10} />
        </div>
      ))}
    </div>
  );
}

/** Placeholder shaped like a results card: header, a bar, and table rows. */
export function SkeletonResults({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="card skeleton-results" role="status" aria-label={label}>
      <Skeleton width="30%" height={12} />
      <Skeleton width="65%" height={24} />
      <Skeleton height={34} radius={10} />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="skeleton-results__row">
          <Skeleton width={12} height={12} radius={3} />
          <Skeleton width="40%" height={14} />
          <Skeleton width="12%" height={14} />
          <Skeleton width="14%" height={14} />
        </div>
      ))}
    </div>
  );
}
