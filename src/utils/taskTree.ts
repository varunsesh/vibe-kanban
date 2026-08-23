import { Task } from '../db/db';

export interface TaskNode {
  task: Task;
  children: TaskNode[];
  depth: number;
}

export function buildTaskTree(tasks: Task[]): TaskNode[] {
  const map = new Map<string, TaskNode>();
  for (const t of tasks) {
    map.set(t.id, { task: t, children: [], depth: 0 });
  }

  const roots: TaskNode[] = [];
  for (const node of map.values()) {
    const parentId = node.task.parentTaskId;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const assignDepth = (node: TaskNode, depth: number) => {
    node.depth = depth;
    for (const child of node.children) assignDepth(child, depth + 1);
  };
  for (const root of roots) assignDepth(root, 0);

  return roots;
}

/** Flattens the tree into an ordered list, skipping children of collapsed nodes. */
export function flattenTree(nodes: TaskNode[], collapsedIds: Set<string>): TaskNode[] {
  const result: TaskNode[] = [];
  const walk = (node: TaskNode) => {
    result.push(node);
    if (!collapsedIds.has(node.task.id)) {
      for (const child of node.children) walk(child);
    }
  };
  for (const root of nodes) walk(root);
  return result;
}

/** Returns all descendant task IDs for a given task (to prevent circular parenting). */
export function getDescendantIds(taskId: string, tasks: Task[]): Set<string> {
  const result = new Set<string>();
  const walk = (id: string) => {
    for (const t of tasks) {
      if (t.parentTaskId === id && !result.has(t.id)) {
        result.add(t.id);
        walk(t.id);
      }
    }
  };
  walk(taskId);
  return result;
}
