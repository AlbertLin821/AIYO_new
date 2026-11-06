export function agentPreviewBucket(userId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < userId.length; index += 1) {
    hash = Math.imul(hash ^ userId.charCodeAt(index), 16777619);
  }
  return (hash >>> 0) % 100;
}

export function isAgentPreviewEnabled(userId: string): boolean {
  const configured = process.env.AGENT_PREVIEW_ROLLOUT_PERCENT?.trim();
  if (!configured) return true;
  const percent = Number(configured);
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) return false;
  return agentPreviewBucket(userId) < percent;
}
