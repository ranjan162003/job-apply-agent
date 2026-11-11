import { CheckCircle2 } from "lucide-react";

interface CompletenessMeterProps {
  percent: number;
  missing: string[];
}

/** How many of the most-asked application fields are filled in. */
export function CompletenessMeter({ percent, missing }: CompletenessMeterProps) {
  return (
    <section className="card completeness" aria-label="Profile completeness">
      <div className="completeness__top">
        <div>
          <span className="completeness__value">{percent}%</span>
          <span className="muted"> of the most-asked fields filled</span>
        </div>
        {percent === 100 && (
          <span className="badge badge--good">
            <CheckCircle2 size={14} aria-hidden="true" /> Ready to apply
          </span>
        )}
      </div>
      <div
        className="completeness__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Profile completeness"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      {missing.length > 0 && (
        <p className="completeness__missing">
          <span className="muted">Still empty: </span>
          {missing.join(" · ")}
        </p>
      )}
    </section>
  );
}
