// Milestone arithmetic for petitions and pledges. Pure, shared by the cached
// loader, the progress bar and the share image.

export const MILESTONE_STEP = 500;

/**
 * The number to aim for next: the goal until it is reached, then the next
 * multiple of 500 above the count. A campaign is never "done": once the goal
 * is passed the bar simply aims higher.
 */
export function nextMilestone(count: number, goal: number | null | undefined): number {
  if (goal && goal > 0 && count < goal) return goal;
  return (Math.floor(Math.max(0, count) / MILESTONE_STEP) + 1) * MILESTONE_STEP;
}

/** Progress toward the milestone, 0 to 100. */
export function milestonePercent(count: number, milestone: number): number {
  if (milestone <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((count / milestone) * 100)));
}

export function formatCount(n: number): string {
  return new Intl.NumberFormat("en-CA").format(n);
}
