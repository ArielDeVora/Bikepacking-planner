import { matchesQuery } from '../../lib/text';

/** A node of the trip tree: its name and its children. */
export interface TreeNode {
  id: string;
  name: string;
  children: TreeNode[];
}

/**
 * Ids to list for a search: whatever matches, the routes, stages and groups it's in, and
 * everything inside a matching route, stage or group. Null when there's no search.
 */
export function visibleIds(nodes: TreeNode[], query: string): Set<string> | null {
  if (!query.trim()) return null;
  const out = new Set<string>();
  const addAll = (n: TreeNode) => {
    out.add(n.id);
    n.children.forEach(addAll);
  };
  const visit = (n: TreeNode): boolean => {
    if (matchesQuery(query, n.name)) {
      addAll(n);
      return true;
    }
    let any = false;
    for (const c of n.children) if (visit(c)) any = true;
    if (any) out.add(n.id);
    return any;
  };
  nodes.forEach(visit);
  return out;
}
