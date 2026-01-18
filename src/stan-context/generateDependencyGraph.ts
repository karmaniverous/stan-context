/**
 * Requirements addressed:
 * - Public API: generateDependencyGraph(opts) => { graph, stats, errors }.
 * - Universe scan defines source nodes (with size + sha256 hash).
 * - Graceful degradation when TypeScript peer dependency is missing:
 *   return a nodes-only graph with complete empty edges map.
 */

import path from 'node:path';

import type { DependencyGraph, GraphOptions, GraphResult, NodeId } from './types';
import { makeHashedFileNode } from './core/nodes';
import { finalizeGraph } from './core/finalize';
import { scanUniverseFiles } from './core/universe';
import { loadTypeScript } from './providers/ts/load';

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

  const nodes: Record<NodeId, (await import('./types')).GraphNode> = {};
  for (const id of universeIds) {
    const absPath = path.join(cwd, id);
    nodes[id] = await makeHashedFileNode({ absPath, cwd, kind: 'source' });
  }

  // Attempt to load TypeScript. If missing, return nodes-only graph.
  try {
    await loadTypeScript();
  } catch {
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
