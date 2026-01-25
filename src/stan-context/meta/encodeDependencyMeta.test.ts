import { describe, expect, test } from 'vitest';

import type { DependencyGraph } from '../types';
import {
  encodeDependencyMeta,
  sha256HexToBase64Url128,
} from './encodeDependencyMeta';

const H = 'a'.repeat(64); // valid hex

const makeGraph = (): DependencyGraph => ({
  nodes: {
    'a.ts': {
      id: 'a.ts',
      kind: 'source',
      language: 'ts',
      description: 'A node',
      metadata: { hash: H, size: 100 },
    },
    'b.ts': {
      id: 'b.ts',
      kind: 'source',
      language: 'ts',
      metadata: { hash: H, size: 50 },
    },
    'c.ts': {
      id: 'c.ts',
      kind: 'source',
      language: 'ts',
      metadata: { hash: H, size: 10 },
    },
    'node:fs': { id: 'node:fs', kind: 'builtin', language: 'other' },
  },
  edges: {
    'a.ts': [
      { target: 'b.ts', kind: 'runtime', resolution: 'explicit' },
      { target: 'b.ts', kind: 'runtime', resolution: 'implicit' },
      { target: 'b.ts', kind: 'type', resolution: 'explicit' },
      { target: 'c.ts', kind: 'runtime', resolution: 'explicit' },
      { target: 'node:fs', kind: 'runtime', resolution: 'explicit' },
    ],
    'b.ts': [],
    'c.ts': [],
    'node:fs': [],
  },
});

describe('sha256HexToBase64Url128', () => {
  test('converts sha256 hex to 128-bit base64url without padding', () => {
    const out = sha256HexToBase64Url128(H);
    expect(out).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(out.includes('=')).toBe(false);
    // 16 bytes -> 22 base64url chars (unpadded)
    expect(out.length).toBe(22);
  });

  test('throws on invalid input', () => {
    expect(() => sha256HexToBase64Url128('hx')).toThrow(/Invalid SHA-256 hex/i);
  });
});

describe('encodeDependencyMeta', () => {
  test('merges edges by target and omits resMask for explicit-only', () => {
    const meta = encodeDependencyMeta({ graph: makeGraph() });

    expect(meta.v).toBe(2);
    expect(meta.n['a.ts'].k).toBe(0); // source
    expect(meta.n['a.ts'].s).toBe(100);
    expect(meta.n['a.ts'].d).toBe('A node');

    // One edge per target:
    // - b.ts: runtime|type => 1|2 = 3; explicit|implicit => 3 (must include 3rd tuple)
    // - c.ts: runtime only, explicit-only => omit resMask
    expect(meta.n['a.ts'].e).toEqual([
      ['b.ts', 3, 3],
      ['c.ts', 1],
      ['node:fs', 1],
    ]);
  });
});
