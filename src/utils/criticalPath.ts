const DAY_MS = 86_400_000;

interface ScheduledTask {
  id: string;
  startDate: number;
  duration: number;
  dependencies?: string[];
}

/**
 * Classic CPM forward/backward pass.
 * Returns the set of task IDs that lie on the critical path (total float = 0).
 * Tasks with no startDate or duration are excluded.
 */
export function computeCriticalPath(tasks: ScheduledTask[]): Set<string> {
  if (tasks.length === 0) return new Set();

  const byId = new Map(tasks.map(t => [t.id, t]));

  // Build successor map for backward pass
  const successors = new Map<string, string[]>();
  for (const t of tasks) successors.set(t.id, []);
  for (const t of tasks) {
    for (const depId of t.dependencies ?? []) {
      if (byId.has(depId)) successors.get(depId)!.push(t.id);
    }
  }

  // Topological sort (Kahn's algorithm); skip nodes involved in cycles
  const inDegree = new Map<string, number>();
  for (const t of tasks) {
    const validDeps = (t.dependencies ?? []).filter(d => byId.has(d));
    inDegree.set(t.id, validDeps.length);
  }
  const queue: string[] = [...tasks.filter(t => inDegree.get(t.id) === 0).map(t => t.id)];
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topoOrder.push(id);
    for (const sId of successors.get(id) ?? []) {
      const deg = inDegree.get(sId)! - 1;
      inDegree.set(sId, deg);
      if (deg === 0) queue.push(sId);
    }
  }
  // Only process tasks that made it through (cycle-free subset)
  const validIds = new Set(topoOrder);

  // Forward pass — ES/EF in ms timestamps
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of topoOrder) {
    const t = byId.get(id)!;
    const durationMs = t.duration * DAY_MS;
    const depEF = (t.dependencies ?? [])
      .filter(d => validIds.has(d))
      .map(d => ef.get(d) ?? 0);
    const earliestStart = depEF.length > 0 ? Math.max(...depEF) : t.startDate;
    es.set(id, Math.max(t.startDate, earliestStart));
    ef.set(id, es.get(id)! + durationMs);
  }

  const projectEnd = Math.max(...[...ef.values()]);

  // Backward pass — LS/LF
  const lf = new Map<string, number>();
  const ls = new Map<string, number>();
  for (const id of [...topoOrder].reverse()) {
    const t = byId.get(id)!;
    const durationMs = t.duration * DAY_MS;
    const succLS = (successors.get(id) ?? [])
      .filter(s => validIds.has(s))
      .map(s => ls.get(s) ?? projectEnd);
    lf.set(id, succLS.length > 0 ? Math.min(...succLS) : projectEnd);
    ls.set(id, lf.get(id)! - durationMs);
  }

  // Float = LS - ES; critical when float ≈ 0
  const critical = new Set<string>();
  for (const id of topoOrder) {
    const float = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    if (Math.abs(float) < DAY_MS * 0.5) critical.add(id);
  }

  return critical;
}
