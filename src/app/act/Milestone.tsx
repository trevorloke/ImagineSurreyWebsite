import { formatCount, milestonePercent } from "./milestone";

/**
 * The signature count against the next milestone. A real progressbar for
 * assistive tech, with the same "N of M" visible to everyone.
 */
export function Milestone({ count, milestone, label = "Signatures", noun = "signatures" }: { count: number; milestone: number; label?: string; noun?: string }) {
  const pct = milestonePercent(count, milestone);
  const remaining = Math.max(0, milestone - count);
  return (
    <div className="milestone">
      <p className="milestone-text">
        <strong className="milestone-count">{formatCount(count)}</strong> of {formatCount(milestone)} {noun}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={milestone}
        aria-valuenow={Math.min(count, milestone)}
        aria-valuetext={`${formatCount(count)} of ${formatCount(milestone)}`}
        className="milestone-bar"
      >
        <div className="milestone-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="milestone-next">{remaining > 0 ? `${formatCount(remaining)} more to reach ${formatCount(milestone)}.` : `Next stop: ${formatCount(milestone)}.`}</p>
    </div>
  );
}
