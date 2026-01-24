> “Context compiler” for STAN — scans a repository and produces a deterministic dependency graph so an LLM can select the right files to read.

# @karmaniverous/stan-context

[![npm version](https://img.shields.io/npm/v/@karmaniverous/stan-context.svg)](https://www.npmjs.com/package/@karmaniverous/stan-context) ![Node Current](https://img.shields.io/node/v/@karmaniverous/stan-context) [![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/stan-context/tree/main/LICENSE)

STAN is moving from a filtering model (“archive everything, then hide files”) to a selection model (“build a Map, then choose the Territory”).

This package builds the Map:

- Scans a repository (“Universe”) using gitignore + selection config.
- Analyzes TS/JS module relationships via a provider model (default: TypeScript compiler API).
- Produces a deterministic, JSON-serializable dependency graph suitable for LLM context selection.

This package does **not**:

- create archives or diffs,
- manage `.stan/` state,
- apply patches,
- implement CLI/TTY behavior.

Those concerns remain in `@karmaniverous/stan-core` (engine) and `@karmaniverous/stan-cli` (CLI adapter).

## Install

```bash
pnpm add @karmaniverous/stan-context
# or npm i @karmaniverous/stan-context
```

Node: `>= 20`

TypeScript: **required** for TS/JS analysis and must be provided explicitly by the host (see example below).

## Quick example

```ts
import ts from 'typescript';
import { generateDependencyGraph } from '@karmaniverous/stan-context';

const res = await generateDependencyGraph({
  cwd: process.cwd(),
  typescript: ts,
  config: {
    includes: [],
    excludes: ['dist/**'],
    anchors: ['README.md'],
  },
  previousGraph: undefined,
});

console.log(res.stats);
// { modules, edges, dirty }
```

## Options (high level)

- `typescript` / `typescriptPath` (required; host-provided)
  - This package does not attempt to resolve TypeScript implicitly.
  - Provide either:
    - `typescript`: an already-loaded TypeScript module instance, or
    - `typescriptPath`: an absolute path to a TypeScript entry module (for example `require.resolve('typescript')` from the host environment).
- `previousGraph`
  - Pass the previously persisted graph to enable incremental analysis and edge reuse.
- `nodeDescriptionLimit` (default: `160`)
  - Produces `GraphNode.description` for TS/JS nodes based on module doc comments.
  - When truncated, uses a strict prefix of exactly N characters and appends ASCII `...`.
  - Set to `0` to omit descriptions.
- `nodeDescriptionTags` (default: `['@module', '@packageDocumentation']`)
  - Controls which TSDoc tags are considered for TS/JS descriptions.
  - Tags must be `@`-prefixed and match `^@\\w+$`.
- `hashSizeEnforcement` (default: `'warn'`)
  - Controls how to handle the invariant “if `metadata.hash` is present for a file node, `metadata.size` should also be present”.
  - Values: `'warn' | 'error' | 'ignore'`.
- `maxErrors` (default: `50`)
  - Caps returned `errors` entries (deterministic truncation).
  - Set to `0` to omit errors.

## What the graph contains (high level)

- Nodes are file-level (module-level) only.
- Node IDs are stable strings:
  - `src/index.ts` (repo-relative source)
  - `node_modules/.pnpm/pkg@1.2.3/node_modules/pkg/index.d.ts` (physical external)
  - `C:/Users/me/dev/lib/index.d.ts` (outside-root absolute, POSIX-normalized)
  - `node:fs` (builtin)
  - `./missing-file` (missing/unresolved specifier)
- Edges are outgoing adjacency lists (one entry per source node), including:
  - explicit edges to imported modules/files
  - implicit (“tunneled”) edges through barrels (`index.ts`) for named/default imports

## Determinism guarantees (consumer-friendly)

- `graph.nodes` keys are sorted for stable serialization.
- `graph.edges` is a complete map: every node key exists (empty `[]` means “analyzed; no outgoing edges”).
- Edge lists are de-duplicated and sorted deterministically.

## Selection summary helper (context-mode budgeting)

This package also exports a helper for computing dependency selection closure membership and aggregate sizing from a graph plus dependency-state entries:

```ts
import {
  summarizeDependencySelection,
  type DependencyStateEntry,
} from '@karmaniverous/stan-context';

const include: DependencyStateEntry[] = [['src/index.ts', 2, ['runtime']]];
const summary = summarizeDependencySelection({ graph: res.graph, include });

console.log(summary.totalBytes, summary.largest, summary.warnings);
```

Contract (summary):

- Entry forms:
  - `nodeId`
  - `[nodeId, depth]`
  - `[nodeId, depth, edgeKinds]`
- Traversal:
  - outgoing edges only
  - depth-limited expansion:
    - depth `0` includes only the seed node
    - depth `N` includes nodes reachable within `N` outgoing-edge traversals
  - `edgeKinds` filters which edges are followed (`runtime` | `type` | `dynamic`)
- Excludes win:
  - expands include closure `S`
  - expands exclude closure `X` using the same semantics
  - final selection is `S \ X`
- Defaults:
  - `defaultEdgeKinds`: `['runtime', 'type', 'dynamic']`
  - `dropNodeKinds`: drops `builtin` and `missing` nodes by default (with warnings)
  - unknown node IDs in state are retained with bytes `0` (with warnings)
- Sizing:
  - `totalBytes` is the sum of `metadata.size` (bytes) for selected nodes where present
  - missing sizes are treated as `0` (with warnings)
  - a common deterministic budgeting heuristic is `estimatedTokens ≈ totalBytes / 4`
- Determinism:
  - `selectedNodeIds` is sorted lexicographically
  - `largest` is sorted by bytes descending, tie-break by nodeId ascending
  - `warnings` is sorted lexicographically

## ESLint plugin

This package ships an optional ESLint plugin subpath export:

```ts
import stanContext from '@karmaniverous/stan-context/eslint';

export default [
  {
    plugins: { 'stan-context': stanContext },
    rules: {
      ...stanContext.configs.recommended.rules,
    },
  },
];
```

The default config enables `stan-context/require-module-description` at `warn`, and ignores test/test-like files by default (common `*.test.*`, `*.spec.*`, and `test`/`tests`/`__tests__` directory patterns across TS/JS-like extensions).

To enforce the rule everywhere (including tests), override it explicitly:

```ts
import stanContext from '@karmaniverous/stan-context/eslint';

export default [
  {
    plugins: { 'stan-context': stanContext },
    rules: {
      ...stanContext.configs.recommended.rules,
      'stan-context/require-module-description': [
        'warn',
        { ignorePatterns: [] },
      ],
    },
  },
];
```

## License

BSD-3-Clause

---

Built for you with ❤️ on Bali! Find more great tools & templates on [my GitHub Profile](https://github.com/karmaniverous).
