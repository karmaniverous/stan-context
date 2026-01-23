/**
 * Requirements addressed:
 * - Public API: generateDependencyGraph(opts) =\> \{ graph, stats, errors \}.
 * - Universe scan defines source nodes (with size + sha256 hash).
 * - Graceful degradation when TypeScript peer dependency is missing:
 *   return a nodes-only graph with complete empty edges map.
 * - Optional node descriptions for TS/JS nodes are derived from doc comments.
 * - Runtime option maxErrors caps output error volume deterministically.
 * - Configurable hash/size invariant enforcement:
 *   warn (default), error (throw), ignore.
 */

import path from 'node:path';

import { applyNodeDescriptions } from './core/descriptions';
import { capErrors } from './core/errors';
import { finalizeGraph } from './core/finalize';
import { planIncremental } from './core/incremental';
import { makeHashedFileNode } from './core/nodes';
import { scanUniverseFiles } from './core/universe';
import { analyzeTypeScript } from './providers/ts/analyze';
import * as tsDescribe from './providers/ts/describe';
import { tryLoadTypeScript } from './providers/ts/load';
import { loadCompilerOptions } from './providers/ts/tsconfig';
import type {
  DependencyGraph,
  GraphEdge,
  GraphNode,
  GraphOptions,
  GraphResult,
  HashSizeEnforcement,
  NodeId,
} from './types';

const DEFAULT_NODE_DESCRIPTION_LIMIT = 160;
const DEFAULT_MAX_ERRORS = 50;
const DEFAULT_NODE_DESCRIPTION_TAGS = [
  '@module',
  '@packageDocumentation',
] as const;
const DEFAULT_HASH_SIZE_ENFORCEMENT: HashSizeEnforcement = 'warn';

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

const validateHashSizeInvariant = (args: {
  graph: DependencyGraph;
  mode: HashSizeEnforcement;
}): string[] => {
  if (args.mode === 'ignore') return [];

  const offenders: string[] = [];
  for (const n of Object.values(args.graph.nodes)) {
    const hashedFileNode =
      (n.kind === 'source' || n.kind === 'external') &&
      typeof n.metadata?.hash === 'string';
    if (!hashedFileNode) continue;
    if (typeof n.metadata?.size !== 'number') offenders.push(n.id);
  }

  const ids = offenders.sort((a, b) => a.localeCompare(b));
  if (!ids.length) return [];

  if (args.mode === 'error') {
    const preview = ids.slice(0, 10).join(', ');
    throw new Error(
      `metadata.size missing for hashed nodes (${String(ids.length)}): ${preview}${
        ids.length > 10 ? ' ...' : ''
      }`,
    );
  }

  return ids.map(
    (id) => `warning: metadata.size missing for hashed node ${id}`,
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

  const nodeDescriptionTags =
    opts.nodeDescriptionTags && opts.nodeDescriptionTags.length
      ? opts.nodeDescriptionTags
      : Array.from(DEFAULT_NODE_DESCRIPTION_TAGS);

  const maxErrors =
    typeof opts.maxErrors === 'number' ? opts.maxErrors : DEFAULT_MAX_ERRORS;

  const hashSizeEnforcement: HashSizeEnforcement =
    opts.hashSizeEnforcement ?? DEFAULT_HASH_SIZE_ENFORCEMENT;

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
      describeSourceText: (a) =>
        tsDescribe.describeTsJsModule({
          ...a,
          tags: nodeDescriptionTags,
        }),
    });

    const graph: DependencyGraph = finalizeGraph({
      nodes: describedNodes,
      edges: edgesBase,
    });

    errors.push(
      ...validateHashSizeInvariant({ graph, mode: hashSizeEnforcement }),
    );

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
    describeSourceText: (a) =>
      tsDescribe.describeTsJsModule({
        ...a,
        tags: nodeDescriptionTags,
      }),
  });

  const graph: DependencyGraph = finalizeGraph({
    nodes: describedNodes,
    edges: mergedEdges,
  });

  errors.push(
    ...validateHashSizeInvariant({ graph, mode: hashSizeEnforcement }),
  );

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
