/**
 * Requirements addressed:
 * - Public API: generateDependencyGraph(opts) =\> \{ graph, stats, errors \}.
 * - Universe scan defines source nodes (with size + sha256 hash).
 * - Graceful degradation when TypeScript peer dependency is missing:
 *   return a nodes-only graph with complete empty edges map.
 */

import path from 'node:path';

import { finalizeGraph } from './core/finalize';
import { makeHashedFileNode } from './core/nodes';
import { scanUniverseFiles } from './core/universe';
import { tryLoadTypeScript } from './providers/ts/load';
import type {
  DependencyGraph,
  GraphNode,
  GraphOptions,
  GraphResult,
  NodeId,
} from './types';

const emptyEdgesMap = (nodes: Record<NodeId, unknown>): Record<NodeId, []> => {
  const out: Record<NodeId, []> = {};
  for (const id of Object.keys(nodes)) out[id] = [];
  return out;
};

export const generateDependencyGraph = async (
  opts: GraphOptions,
): Promise<GraphResult> => {
  const errors: string[] = [];
  const cwd = opts.cwd;

  const universeIds = await scanUniverseFiles({ cwd, config: opts.config });

  const nodes: Record<NodeId, GraphNode> = {};
  for (const id of universeIds) {
    const absPath = path.join(cwd, id);
    nodes[id] = await makeHashedFileNode({ absPath, cwd, kind: 'source' });
  }

  // Attempt to load TypeScript. If missing, return nodes-only graph.
  const ts = tryLoadTypeScript();
  if (!ts) {
    errors.push(
      'typescript peer dependency not found; returning nodes-only graph',
    );
    const graph: DependencyGraph = finalizeGraph({
      nodes,
      edges: emptyEdgesMap(nodes),
    });
    return {
      graph,
      stats: { modules: Object.keys(graph.nodes).length, edges: 0, dirty: 0 },
      errors,
    };
  }
  void ts;

  // TODO (next dev-plan step): TypeScript provider analysis + incrementalism.
  const graph: DependencyGraph = finalizeGraph({
    nodes,
    edges: emptyEdgesMap(nodes),
  });
  return {
    graph,
    stats: { modules: Object.keys(graph.nodes).length, edges: 0, dirty: 0 },
    errors,
  };
};
