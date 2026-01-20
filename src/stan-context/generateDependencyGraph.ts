/**
 * Requirements addressed:
 * - Public API: generateDependencyGraph(opts) => { graph, stats, errors }.
 * - Universe scan defines source nodes (with size + sha256 hash).
 * - Graceful degradation when TypeScript peer dependency is missing:
 *   return a nodes-only graph with complete empty edges map.
 * - Optional node descriptions for TS/JS nodes are derived from doc comments.
 * - Runtime option maxErrors caps output error volume deterministically.
 */

import path from 'node:path';

import { applyNodeDescriptions } from './core/descriptions';
import { capErrors } from './core/errors';
import { finalizeGraph } from './core/finalize';
import { planIncremental } from './core/incremental';
import { makeHashedFileNode } from './core/nodes';
import { scanUniverseFiles } from './core/universe';
import { analyzeTypeScript } from './providers/ts/analyze';
import { describeTsJsModule } from './providers/ts/describe';
import { tryLoadTypeScript } from './providers/ts/load';
import { loadCompilerOptions } from './providers/ts/tsconfig';
import type {
  DependencyGraph,
  GraphEdge,
  GraphNode,
  GraphOptions,
  GraphResult,
  NodeId,
} from './types';

const DEFAULT_NODE_DESCRIPTION_LIMIT = 160;
const DEFAULT_MAX_ERRORS = 50;

const isAnalyzableSource = (id: string): boolean => {
  const lower = id.toLowerCase();
  return (
    lower.endsWith('.d.ts') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.jsx')
  );
};

export const generateDependencyGraph = async (
  opts: GraphOptions,
): Promise<GraphResult> => {
  const errors: string[] = [];
  const cwd = opts.cwd;

  const nodeDescriptionLimit =
    typeof opts.nodeDescriptionLimit === 'number'
      ? opts.nodeDescriptionLimit
      : DEFAULT_NODE_DESCRIPTION_LIMIT;

  const maxErrors =
    typeof opts.maxErrors === 'number' ? opts.maxErrors : DEFAULT_MAX_ERRORS;

  const universeIds = await scanUniverseFiles({ cwd, config: opts.config });
  const analyzableSourceIds = universeIds.filter(isAnalyzableSource);

  const currentNodes: Record<NodeId, GraphNode> = {};
  for (const id of universeIds) {
    const absPath = path.join(cwd, id);
    currentNodes[id] = await makeHashedFileNode({
      absPath,
      cwd,
      kind: 'source',
    });
  }

  const inc = await planIncremental({
    cwd,
    analyzableSourceIds,
    currentNodes,
    previousGraph: opts.previousGraph,
  });

  const baseNodes: Record<NodeId, GraphNode> = {
    ...inc.carriedNodes,
    ...currentNodes,
  };
  const edgesBase: Record<NodeId, GraphEdge[]> = {
    ...inc.reusedEdgesBySource,
  };

  // Attempt to load TypeScript. If missing, return nodes-only graph.
  const ts = tryLoadTypeScript();
  if (!ts) {
    errors.push(
      'typescript peer dependency not found; returning nodes-only graph',
    );

    const describedNodes = await applyNodeDescriptions({
      cwd,
      nodes: baseNodes,
      nodeDescriptionLimit,
      describeSourceText: describeTsJsModule,
    });

    const graph: DependencyGraph = finalizeGraph({
      nodes: describedNodes,
      edges: edgesBase,
    });

    return {
      graph,
      stats: {
        modules: Object.keys(graph.nodes).length,
        edges: Object.values(graph.edges).reduce((n, es) => n + es.length, 0),
        dirty: inc.dirtySourceIds.size,
      },
      errors: capErrors(errors, maxErrors),
    };
  }

  const compilerOptions = loadCompilerOptions({ ts, cwd });

  const analyzed = await analyzeTypeScript({
    ts,
    cwd,
    compilerOptions,
    universeSourceIds: analyzableSourceIds,
    dirtySourceIds: inc.dirtySourceIds,
    baseNodes,
  });

  const mergedEdges: Record<NodeId, GraphEdge[]> = {
    ...edgesBase,
    ...analyzed.edgesBySource,
  };

  const describedNodes = await applyNodeDescriptions({
    cwd,
    nodes: analyzed.nodes,
    nodeDescriptionLimit,
    describeSourceText: describeTsJsModule,
  });

  const graph: DependencyGraph = finalizeGraph({
    nodes: describedNodes,
    edges: mergedEdges,
  });

  return {
    graph,
    stats: {
      modules: Object.keys(graph.nodes).length,
      edges: Object.values(graph.edges).reduce((n, es) => n + es.length, 0),
      dirty: inc.dirtySourceIds.size,
    },
    errors: capErrors([...errors, ...analyzed.errors], maxErrors),
  };
};
