/**
 * Requirements addressed:
 * - Incremental planning MUST mark dirty sources as the transitive reverse-deps
 *   closure of changed nodes.
 * - Changes to external nodes MUST invalidate dependent sources so tunneling
 *   stays correct across package entrypoints (“commander rule” scenarios).
 */

import path from 'node:path';

import { withTempDir, writeFile } from '../../test/temp';
import type { DependencyGraph, GraphEdge, GraphNode, NodeId } from '../types';
import { planIncremental } from './incremental';
import { makeHashedFileNode } from './nodes';

const edge = (target: NodeId): GraphEdge => ({
  target,
  kind: 'runtime',
  resolution: 'explicit',
});

const hashed = async (
  cwd: string,
  rel: string,
  kind: 'source' | 'external',
): Promise<GraphNode> =>
  makeHashedFileNode({ absPath: path.join(cwd, rel), cwd, kind });

describe('planIncremental', () => {
  test('dirty includes transitive reverse-deps closure', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(cwd, 'a.ts', `export const a = 1;\n`);
      await writeFile(cwd, 'b.ts', `export const b = 1;\n`);
      await writeFile(cwd, 'c.ts', `export const c = 1;\n`);

      const prevA = await hashed(cwd, 'a.ts', 'source');
      const prevB = await hashed(cwd, 'b.ts', 'source');
      const prevC = await hashed(cwd, 'c.ts', 'source');

      const prevGraph: DependencyGraph = {
        nodes: {
          [prevA.id]: prevA,
          [prevB.id]: prevB,
          [prevC.id]: prevC,
        },
        edges: {
          [prevA.id]: [edge(prevB.id)],
          [prevB.id]: [edge(prevC.id)],
          [prevC.id]: [],
        },
      };

      // Change the leaf and expect A and B to become dirty via reverse deps.
      await writeFile(cwd, 'c.ts', `export const c = 2;\n`);

      const curA = await hashed(cwd, 'a.ts', 'source');
      const curB = await hashed(cwd, 'b.ts', 'source');
      const curC = await hashed(cwd, 'c.ts', 'source');

      const currentNodes: Record<NodeId, GraphNode> = {
        [curA.id]: curA,
        [curB.id]: curB,
        [curC.id]: curC,
      };

      const plan = await planIncremental({
        cwd,
        analyzableSourceIds: [curA.id, curB.id, curC.id],
        currentNodes,
        previousGraph: prevGraph,
      });

      const dirty = Array.from(plan.dirtySourceIds).sort();
      expect(dirty).toEqual([curA.id, curB.id, curC.id].sort());
      expect(plan.changedNodeIds.has(curC.id)).toBe(true);
    });
  });

  test('external hash changes mark dependents dirty', async () => {
    await withTempDir(async (cwd) => {
      await writeFile(cwd, 'use.ts', `export const use = 1;\n`);
      await writeFile(
        cwd,
        'node_modules/pkg/index.d.ts',
        `export interface A { a: string }\n`,
      );

      const prevUse = await hashed(cwd, 'use.ts', 'source');
      const prevExt = await hashed(
        cwd,
        'node_modules/pkg/index.d.ts',
        'external',
      );

      const prevGraph: DependencyGraph = {
        nodes: {
          [prevUse.id]: prevUse,
          [prevExt.id]: prevExt,
        },
        edges: {
          [prevUse.id]: [edge(prevExt.id)],
          [prevExt.id]: [],
        },
      };

      // Change the external file. Universe scanning would not include it in
      // currentNodes, but previousGraph does; planIncremental should detect it.
      await writeFile(
        cwd,
        'node_modules/pkg/index.d.ts',
        `export interface A { a: string; v: 2 }\n`,
      );

      const curUse = await hashed(cwd, 'use.ts', 'source');
      const currentNodes: Record<NodeId, GraphNode> = {
        [curUse.id]: curUse,
      };

      const plan = await planIncremental({
        cwd,
        analyzableSourceIds: [curUse.id],
        currentNodes,
        previousGraph: prevGraph,
      });

      expect(plan.changedNodeIds.has(prevExt.id)).toBe(true);
      expect(plan.dirtySourceIds.has(curUse.id)).toBe(true);
    });
  });
});
