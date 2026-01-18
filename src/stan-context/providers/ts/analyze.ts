/**
 * Requirements addressed:
 * - TS/JS provider: explicit edges + barrel tunneling (symbol-aware).
 * - Builtin normalization: fs => node:fs.
 * - Missing module nodes (kind: missing; id = specifier).
 * - External commander rule: for external entrypoints, tunnel only within the
 *   same nearest-package.json boundary.
 */

import path from 'node:path';

import { makeHashedFileNode, makeNode } from '../../core/nodes';
import { absPathToNodeId, toPosixPath } from '../../core/paths';
import type { GraphEdge, GraphEdgeKind, GraphNode, NodeId } from '../../types';
import { inferLanguageFromPath } from '../../types';
import { extractFromSourceFile } from './extract';
import { resolveModuleSpecifier } from './moduleResolution';
import { filterCommanderRule, getDeclarationFilesForImport } from './tunnel';

const isNodeModulesPath = (absPath: string): boolean =>
  toPosixPath(absPath).includes('/node_modules/');

const ensureNode = async (args: {
  cwd: string;
  existing: Record<NodeId, GraphNode>;
  absPath: string;
  kindHint: 'source' | 'external';
}): Promise<GraphNode> => {
  const { id } = absPathToNodeId(args.absPath, args.cwd);
  const existing = args.existing[id];
  if (existing?.metadata?.hash && existing?.metadata?.size !== undefined)
    return existing;
  const created = await makeHashedFileNode({
    absPath: args.absPath,
    cwd: args.cwd,
    kind: args.kindHint,
  });
  args.existing[id] = created;
  return created;
};

const ensureBuiltinNode = (
  nodes: Record<NodeId, GraphNode>,
  id: `node:${string}`,
) => {
  if (nodes[id]) return;
  nodes[id] = makeNode({ id, kind: 'builtin', language: 'other' });
};

const ensureMissingNode = (nodes: Record<NodeId, GraphNode>, id: string) => {
  if (nodes[id]) return;
  nodes[id] = makeNode({ id, kind: 'missing', language: 'other' });
};

export const analyzeTypeScript = async (args: {
  ts: typeof import('typescript');
  cwd: string;
  compilerOptions: import('typescript').CompilerOptions;
  universeSourceIds: NodeId[];
  dirtySourceIds: Set<NodeId>;
  baseNodes: Record<NodeId, GraphNode>;
}): Promise<{
  nodes: Record<NodeId, GraphNode>;
  edgesBySource: Record<NodeId, GraphEdge[]>;
  errors: string[];
}> => {
  const { ts, cwd } = args;
  const errors: string[] = [];

  const nodes: Record<NodeId, GraphNode> = { ...args.baseNodes };
  const edgesBySource: Record<NodeId, GraphEdge[]> = {};

  const rootAbs = args.universeSourceIds.map((id) => path.join(cwd, id));
  const host = ts.createCompilerHost(args.compilerOptions, true);
  host.getCurrentDirectory = () => cwd;

  const program = ts.createProgram({
    rootNames: rootAbs,
    options: args.compilerOptions,
    host,
  });
  const checker = program.getTypeChecker();

  for (const sourceId of args.dirtySourceIds) {
    const abs = path.join(cwd, sourceId);
    const sf = program.getSourceFile(abs);
    if (!sf) continue;

    const { explicit, tunnels } = extractFromSourceFile({ ts, sourceFile: sf });

    const outEdges: GraphEdge[] = [];

    // Explicit edges.
    for (const ex of explicit) {
      const resolved = resolveModuleSpecifier({
        ts,
        fromAbsPath: abs,
        specifier: ex.specifier,
        compilerOptions: args.compilerOptions,
      });

      if (resolved.kind === 'builtin') {
        ensureBuiltinNode(nodes, resolved.id);
        outEdges.push({
          target: resolved.id,
          kind: ex.kind,
          resolution: 'explicit',
        });
        continue;
      }

      if (resolved.kind === 'missing') {
        ensureMissingNode(nodes, resolved.id);
        outEdges.push({
          target: resolved.id,
          kind: ex.kind,
          resolution: 'explicit',
        });
        continue;
      }

      const { id } = absPathToNodeId(resolved.absPath, cwd);
      const inUniverseAsSource = nodes[id]?.kind === 'source';
      const kindHint: 'source' | 'external' =
        inUniverseAsSource ||
        (!resolved.isExternalLibraryImport &&
          !isNodeModulesPath(resolved.absPath))
          ? 'source'
          : 'external';

      await ensureNode({
        cwd,
        existing: nodes,
        absPath: resolved.absPath,
        kindHint,
      });

      outEdges.push({ target: id, kind: ex.kind, resolution: 'explicit' });
    }

    // Implicit tunneled edges (barrel tunneling + commander rule boundary).
    for (const t of tunnels) {
      const resolved = resolveModuleSpecifier({
        ts,
        fromAbsPath: abs,
        specifier: t.specifier,
        compilerOptions: args.compilerOptions,
      });

      if (resolved.kind !== 'file') continue;

      const decls = getDeclarationFilesForImport({
        ts,
        checker,
        identifiers: t.identifiers,
      });

      const barrelIsExternal =
        resolved.isExternalLibraryImport || isNodeModulesPath(resolved.absPath);

      const filtered = barrelIsExternal
        ? filterCommanderRule({
            barrelAbsPath: resolved.absPath,
            declarationAbsPaths: decls,
            kind: t.kind,
          })
        : decls;

      for (const declAbs of filtered) {
        const { id } = absPathToNodeId(declAbs, cwd);
        const lang = inferLanguageFromPath(id);
        if (lang === 'other') {
          // Still allow .d.ts and other resolvable files; we only skip unknown
          // file extensions (e.g., lib.dom.d.ts resolves to ts).
        }

        const inUniverseAsSource = nodes[id]?.kind === 'source';
        const kindHint: 'source' | 'external' =
          inUniverseAsSource ||
          (!isNodeModulesPath(declAbs) && !resolved.isExternalLibraryImport)
            ? 'source'
            : 'external';

        await ensureNode({ cwd, existing: nodes, absPath: declAbs, kindHint });

        outEdges.push({ target: id, kind: t.kind, resolution: 'implicit' });
      }
    }

    edgesBySource[sourceId] = outEdges;
  }

  return { nodes, edgesBySource, errors };
};
