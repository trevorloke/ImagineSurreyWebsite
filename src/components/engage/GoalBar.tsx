import { nextMilestone } from "@/lib/engagement";
import "./engage.css";

/**
 * Progress toward a campaign goal, as an accessible progress bar with the
 * numbers written out. The goal is the target until it is reached; after
 * that the bar runs to the next multiple of 500, so it never reads "done".
 *
 *   <GoalBar count={stats.petition} goal={2500} label="SkyTrain petition signatures" />
 *   <GoalBar count={n} goal={goal} label="…" unit="pledges" onDark />   // on navy sections
 */
export function GoalBar({ count, goal, label, unit = "signatures", onDark = false }: { count: number; goal?: number | null; label: string; unit?: string; onDark?: boolean }) {
  const milestone = nextMilestone(count, goal);
  const pct = Math.max(0, Math.min(100, (count / milestone) * 100));
  const fmt = (n: number) => n.toLocaleString("en-CA");
  const text = `${fmt(count)} of ${fmt(milestone)} ${unit}`;
  const passedGoal = goal != null && goal > 0 && count >= goal;
  return (
    <div className={`goal-bar${onDark ? " goal-bar--on-dark" : ""}`}>
      <div className="goal-bar__track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={milestone} aria-valuenow={count} aria-valuetext={text}>
        <div className="goal-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="goal-bar__text">
        <strong>{fmt(count)}</strong> of {fmt(milestone)} {unit}
        {passedGoal && <> · past the first goal of {fmt(goal)}, on to {fmt(milestone)}</>}
      </p>
    </div>
  );
}
