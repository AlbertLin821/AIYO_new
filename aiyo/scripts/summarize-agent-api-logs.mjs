import readline from "node:readline";

const groups = new Map();
for await (const line of readline.createInterface({ input: process.stdin })) {
  const marker = "[agent-api] ";
  const index = line.indexOf(marker);
  if (index < 0) continue;
  let entry;
  try { entry = JSON.parse(line.slice(index + marker.length)); } catch { continue; }
  if (!["preview", "apply"].includes(entry.operation) || !Number.isInteger(entry.status) || !Number.isFinite(entry.durationMs)) continue;
  const group = groups.get(entry.operation) || { statuses: {}, durations: [] };
  group.statuses[entry.status] = (group.statuses[entry.status] || 0) + 1;
  group.durations.push(entry.durationMs);
  groups.set(entry.operation, group);
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

const summary = Object.fromEntries([...groups.entries()].map(([operation, group]) => {
  const durations = group.durations.sort((left, right) => left - right);
  const failures = Object.entries(group.statuses).reduce((count, [status, value]) => count + (Number(status) >= 500 ? value : 0), 0);
  return [operation, {
    calls: durations.length,
    statuses: group.statuses,
    serviceFailureRate: durations.length ? Number((failures / durations.length).toFixed(4)) : null,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
  }];
}));
console.log(JSON.stringify(summary, null, 2));
