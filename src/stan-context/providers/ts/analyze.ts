/**
 * Requirements addressed:
 * - TS/JS provider: explicit edges + barrel tunneling (symbol-aware).
 * - Builtin normalization: fs =\> node:fs.
 * - Missing module nodes (kind: missing; id = specifier).
 * - External commander rule: for external entrypoints, tunnel only within the
 *   same nearest-package.json boundary.
 */

import path from 'node:path';

import type * as tsLib from 'typescript';

import { makeHashedFileNode, makeNode } from '../../core/nodes';
import { absPathToNodeId, toPosixPath } from '../../core/paths';
import type { GraphEdge, GraphNode, NodeId } from '../../types';
import { extractFromSourceFile } from './extract';
import { resolveModuleSpecifier } from './moduleResolution';
import {
  filterCommanderRule,
  getDeclarationFilesForBarrelExportNames,
} from './tunnel';

const isNodeModulesPath = (absPath: string): boolean =>
  toPosixPath(absPath).includes('/node_modules/');

const hasOwn = (rec: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(rec, key);
const getOwn = <T>(rec: Record<string, T>, key: string): T | undefined =>
  hasOwn(rec, key) ? rec[key] : undefined;

const ensureNode = async (args: {
  cwd: string;
  existing: Record<NodeId, GraphNode>;
  absPath: string;
  kindHint: 'source' | 'external';
}): Promise<GraphNode> => {
  const { id } = absPathToNodeId(args.absPath, args.cwd);
  const existing = getOwn(args.existing, id);
  if (existing) {
    const md = existing.metadata;
    if (md && typeof md.hash === 'string' && typeof md.size === 'number') {
      return existing;
    }
  }

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
  if (hasOwn(nodes, id)) return;
  nodes[id] = makeNode({ id, kind: 'builtin', language: 'other' });
};

const ensureMissingNode = (nodes: Record<NodeId, GraphNode>, id: string) => {
  if (hasOwn(nodes, id)) return;
  nodes[id] = makeNode({ id, kind: 'missing', language: 'other' });
};

export const analyzeTypeScript = async (args: {
  ts: typeof tsLib;
  cwd: string;
  compilerOptions: tsLib.CompilerOptions;
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

  const rootAbs = args.universeSourceIds.map((id) => path.resolve(cwd, id));
  const host = ts.createCompilerHost(args.compilerOptions, true);
  host.getCurrentDirectory = () => cwd;

  const program = ts.createProgram({
    rootNames: rootAbs,
    options: args.compilerOptions,
    host,
  });
  const checker = program.getTypeChecker();

  const getProgramSourceFile = (
    absPath: string,
  ): tsLib.SourceFile | undefined => {
    const resolved = path.resolve(absPath);
    const candidates = [
      absPath,
      resolved,
      toPosixPath(absPath),
      toPosixPath(resolved),
    ];
    for (const c of candidates) {
      const sf = program.getSourceFile(c);
      if (sf) return sf;
    }
    return undefined;
  };

  // AST-first traversal sometimes needs to read external `.d.ts` files that the
  // Program may not have loaded as SourceFiles. For traversal, a best-effort
  // parse is sufficient; we cache these to avoid repeated reads.
  const parsedSourceFileCache = new Map<string, tsLib.SourceFile>();
  const getAnySourceFile = (absPath: string): tsLib.SourceFile | undefined => {
    const sf = getProgramSourceFile(absPath);
    if (sf) return sf;
    const cached = parsedSourceFileCache.get(absPath);
    if (cached) return cached;
    const body = ts.sys.readFile(absPath);
    if (typeof body !== 'string') return undefined;
    const created = ts.createSourceFile(
      absPath,
      body,
      ts.ScriptTarget.ES2022,
      true,
    );
    parsedSourceFileCache.set(absPath, created);
    return created;
  };

  for (const sourceId of args.dirtySourceIds) {
    const abs = path.resolve(cwd, sourceId);
    const sf = getProgramSourceFile(abs);
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
      const inUniverseAsSource =
        hasOwn(nodes, id) && nodes[id].kind === 'source';
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

      const barrelSf = getAnySourceFile(resolved.absPath);
      if (!barrelSf) continue;

      const decls = getDeclarationFilesForBarrelExportNames({
        ts,
        checker,
        barrelSourceFile: barrelSf,
        exportNames: [t.exportName],
        resolveAbsPath: (fromAbsPath, specifier) => {
          const r = resolveModuleSpecifier({
            ts,
            fromAbsPath,
            specifier,
            compilerOptions: args.compilerOptions,
          });
          return r.kind === 'file' ? r.absPath : null;
        },
        getSourceFile: (absPath) => getAnySourceFile(absPath),
      });

      const barrelIsExternal =
        resolved.isExternalLibraryImport || isNodeModulesPath(resolved.absPath);

      const filtered = barrelIsExternal
        ? filterCommanderRule({
            barrelAbsPath: resolved.absPath,
            declarationAbsPaths: decls,
          })
        : decls;

      for (const declAbs of filtered) {
        const { id } = absPathToNodeId(declAbs, cwd);
        const inUniverseAsSource =
          hasOwn(nodes, id) && nodes[id].kind === 'source';
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
