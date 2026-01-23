import { describe, expect, test } from 'vitest';

import type { DependencyGraph } from '../types';
import { summarizeDependencySelection } from './summarizeDependencySelection';

const makeGraph = (): DependencyGraph => {
  return {
    nodes: {
      'a.ts': {
        id: 'a.ts',
        kind: 'source',
        language: 'ts',
        metadata: { hash: 'ha', size: 100 },
      },
      'b.ts': {
        id: 'b.ts',
        kind: 'source',
        language: 'ts',
        metadata: { hash: 'hb', size: 50 },
      },
      'c.ts': {
        id: 'c.ts',
        kind: 'source',
        language: 'ts',
        metadata: { hash: 'hc', size: 10 },
      },
      'd.ts': {
        id: 'd.ts',
        kind: 'source',
        language: 'ts',
        metadata: { hash: 'hd', size: 999 },
      },
      './nope': { id: './nope', kind: 'missing', language: 'other' },
      'node:fs': { id: 'node:fs', kind: 'builtin', language: 'other' },
      'hashed-no-size.ts': {
        id: 'hashed-no-size.ts',
        kind: 'source',
        language: 'ts',
        metadata: { hash: 'hx' },
      },
    },
    edges: {
      'a.ts': [
        { target: 'b.ts', kind: 'runtime', resolution: 'explicit' },
        { target: 'd.ts', kind: 'dynamic', resolution: 'explicit' },
      ],
      'b.ts': [{ target: 'c.ts', kind: 'runtime', resolution: 'explicit' }],
      'c.ts': [],
      'd.ts': [],
      './nope': [],
      'node:fs': [],
      'hashed-no-size.ts': [],
    },
  };
};

describe('summarizeDependencySelection', () => {
  test('expands include closure with depth + edgeKinds filtering', () => {
    const graph = makeGraph();
    const res = summarizeDependencySelection({
      graph,
      include: [['a.ts', 2, ['runtime']]],
    });

    // a -> b -> c via runtime edges; dynamic edge to d is excluded by edgeKinds.
    expect(res.selectedNodeIds).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(res.totalBytes).toBe(100 + 50 + 10);
    expect(res.largest[0]).toEqual({ nodeId: 'a.ts', bytes: 100 });
  });

  test('excludes subtract after expansion (excludes win)', () => {
    const graph = makeGraph();
    const res = summarizeDependencySelection({
      graph,
      include: [['a.ts', 2, ['runtime']]],
      exclude: [['b.ts', 0, ['runtime']]],
    });

    // Excluding b at depth 0 removes only b, not its downstream c.
    expect(res.selectedNodeIds).toEqual(['a.ts', 'c.ts']);
  });

  test('keeps unknown node IDs (Option A) with bytes 0 and warning', () => {
    const graph = makeGraph();
    const res = summarizeDependencySelection({
      graph,
      include: ['unknown.ts'],
    });

    expect(res.selectedNodeIds).toEqual(['unknown.ts']);
    expect(res.totalBytes).toBe(0);
    expect(
      res.warnings.some((w) =>
        w.includes('Selected nodeId not present in graph.nodes: unknown.ts'),
      ),
    ).toBe(true);
  });

  test('drops builtin/missing by default and warns', () => {
    const graph = makeGraph();
    const res = summarizeDependencySelection({
      graph,
      include: ['node:fs', './nope', 'a.ts'],
    });

    expect(res.selectedNodeIds).toEqual(['a.ts']);
    expect(
      res.warnings.some((w) =>
        w.includes('Dropped builtin node from selection'),
      ),
    ).toBe(true);
    expect(
      res.warnings.some((w) =>
        w.includes('Dropped missing node from selection'),
      ),
    ).toBe(true);
  });

  test('warns on invalid edgeKinds and does not traverse when none remain', () => {
    const graph = makeGraph();
    const res = summarizeDependencySelection({
      graph,
      include: [['a.ts', 2, ['not-a-kind' as never]]],
    });

    // With no valid edge kinds, only the seed is included.
    expect(res.selectedNodeIds).toEqual(['a.ts']);
    expect(res.warnings.some((w) => w.includes('Invalid edgeKind'))).toBe(true);
    expect(res.warnings.some((w) => w.includes('No valid edgeKinds'))).toBe(
      true,
    );
  });

  test('hashSizeEnforcement=warn adds warnings (default)', () => {
    const graph = makeGraph();
    const res = summarizeDependencySelection({
      graph,
      include: ['hashed-no-size.ts'],
    });

    expect(res.selectedNodeIds).toEqual(['hashed-no-size.ts']);
    expect(
      res.warnings.some((w) =>
        w.includes('metadata.size missing for hashed node'),
      ),
    ).toBe(true);
  });

  test('hashSizeEnforcement=error throws when hashed size is missing', () => {
    const graph = makeGraph();
    expect(() =>
      summarizeDependencySelection({
        graph,
        include: ['hashed-no-size.ts'],
        options: { hashSizeEnforcement: 'error', dropNodeKinds: [] },
      }),
    ).toThrow(/metadata\.size missing for hashed nodes/);
  });
});
