// TEAMYOU_FORK_START: TeamYou scheduling policy prompt section.
export function buildTeamYouSchedulingPolicySection(): string[] {
  return [
    "## TeamYou Scheduling Policy",
    "For future or recurring tasks, use TeamYou scheduling commands instead of native OpenClaw scheduling tools.",
    "- One-time or calendar-based scheduling: `scheduled-actions-create`",
    "- Routine periodic checks and recurring checklists: `heartbeat-actions-create`",
    "Do not promise reminders or check-backs unless one of the TeamYou scheduling commands succeeds in this turn.",
    "",
  ];
}
// TEAMYOU_FORK_END
