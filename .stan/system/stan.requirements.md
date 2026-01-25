# STAN — Requirements (stan-context)

This document defines the durable requirements for `@karmaniverous/stan-context` (“stan-context”), the “Context Compiler” package.

stan-context scans a repository and produces a deterministic, serializable dependency graph (“the Map”) for consumption by hosts (stan-core/stan-cli/etc.).

## Vision & role

- Pure analysis engine: no `.stan/` persistence, archiving, patching, or CLI/TTY behavior.
- Stateless: accepts filesystem + config inputs; returns JSON data.
- Provider-based: core orchestrates; providers analyze languages and emit nodes/edges.

## Architecture

- Core (`src/stan-context/core/`):
  - Universe scan (file discovery)
  - hashing/sizing
  - incremental invalidation via `previousGraph`
  - deterministic graph normalization (sorted keys; de-dupe; stable ordering)
- Providers (`src/stan-context/providers/`):
  - implement language-specific analysis
  - default TS/JS provider uses the TypeScript compiler API

## Data model (DependencyGraph)

Output graph MUST be JSON-serializable and deterministic.

### NodeId

`NodeId` is a string:

- repo-relative POSIX path for in-repo files (e.g., `src/index.ts`)
- POSIX-normalized absolute path for outside-root files (e.g., `C:/x/y.d.ts`)
- builtin module: `node:<name>` (e.g., `node:fs`)
- missing/unresolved module: the import specifier (e.g., `./missing-file`)

### Types (contract shape)

```ts
export type NodeId = string;

export type GraphNodeKind = 'source' | 'external' | 'builtin' | 'missing';
export type GraphLanguage = 'ts' | 'js' | 'json' | 'md' | 'other';

export type GraphNodeMetadata = {
  size?: number;
  hash?: string; // sha256 hex for file nodes
  isOutsideRoot?: true;
};

export type GraphNode = {
  id: NodeId;
  kind: GraphNodeKind;
  language: GraphLanguage;
  description?: string;
  metadata?: GraphNodeMetadata;
};

export type GraphEdgeKind = 'runtime' | 'type' | 'dynamic';
export type GraphEdgeResolution = 'explicit' | 'implicit';

export type GraphEdge = {
  target: NodeId;
  kind: GraphEdgeKind;
  resolution: GraphEdgeResolution;
};

export type DependencyGraph = {
  nodes: Record<NodeId, GraphNode>;
  edges: Record<NodeId, GraphEdge[]>;
};
```

### Determinism requirements

- Node keys in `nodes` are sorted lexicographically for stable serialization.
- `edges` MUST contain a key for every node ID in `nodes` (missing means `[]`).
- Each `edges[source]` list MUST be de-duplicated and sorted deterministically.
- When `metadata` fields are present, key ordering MUST be stable (`hash`, `isOutsideRoot`, `size`).

## Universe scanning (“source”)

- Scan using `.gitignore` (root) + selection config.
- Precedence:
  - `includes` override `.gitignore`
  - `excludes` override `includes`
- Implicit exclusions in scan:
  - `.git/**` always
  - `node_modules/**` unless explicitly re-included via `includes`
- Every discovered file becomes a `source` node (even if it produces no edges).

## Hashing & metadata

- `source` and `external` file nodes SHOULD have:
  - `metadata.size` (bytes)
  - `metadata.hash` (sha256 hex)
- `builtin` and `missing` nodes omit file metadata.
- Outside-root files use absolute NodeId and set `metadata.isOutsideRoot: true`.

### Hash/size invariant enforcement (configurable)

Supported invariant: if a file node has `metadata.hash`, it should also have `metadata.size`.

Enforcement is configurable via `hashSizeEnforcement`:

- `'warn'` (default): deterministic warnings
- `'error'`: throw deterministically
- `'ignore'`: silent

## TS/JS provider requirements (default)

- Supported extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`
- TypeScript module MUST be provided explicitly by the host:
  - `GraphOptions.typescript` or `GraphOptions.typescriptPath`
  - no implicit `require('typescript')` fallback
- Module resolution outcomes:
  - builtins normalize to `node:<name>`
  - missing specifiers create `missing` nodes (id is the specifier)
  - externals create `external` nodes; physical paths preserved unless host rewrites

### Barrel tunneling (implicit edges)

- For named/default imports, emit:
  - explicit edge to imported module/barrel
  - implicit edge(s) to the defining module(s) for the imported symbol(s)
- Namespace imports are not tunneled (explicit edge only).
- Re-export traversal must be AST-first for robustness across TS versions and `.d.ts`.

## Public API

### `generateDependencyGraph(opts)`

- Returns `{ graph, stats, errors }`.
- Throws if TypeScript cannot be loaded from injected inputs.
- Accepts `previousGraph` for incremental rebuilds.

## Selection helper (interop)

stan-context MUST export a deterministic helper:

- `summarizeDependencySelection({ graph, include, exclude, options })`

It computes:

- selection closure membership
- `totalBytes` from `metadata.size`
- deterministic summaries (`selectedNodeIds`, `largest`, `warnings`)

State entry forms supported:

- `nodeId`
- `[nodeId, depth]`
- `[nodeId, depth, ('runtime'|'type'|'dynamic')[]]`
- `[nodeId, depth, kindMask]` where runtime=1, type=2, dynamic=4, all=7

## Dependency context mode (engine contract; assistant-facing meta/state)

Hosts implementing “dependency context mode” use compact assistant-facing files under `<stanPath>/context/`:

- `dependency.meta.json` (v2): traversal + budgeting Map
- `dependency.state.json` (v2): assistant-authored Directives

Both MUST be minified by default.

### Stable decode tables (must be in assistant system prompt)

Node kind index (`meta.n[nodeId].k`):

- `0` source
- `1` external
- `2` builtin
- `3` missing

Edge kind mask bits:

- runtime = `1`
- type = `2`
- dynamic = `4`
- all = `7`

Edge resolution mask bits (meta only; optional third tuple element):

- explicit = `1`
- implicit = `2`
- both = `3`
- if omitted: explicit-only

### `dependency.meta.json` v2 schema (assistant-facing; no hashes)

Assistant meta MUST preserve NodeId strings for reasoning and MUST omit hashes.

```ts
type DependencyMetaV2 = {
  v: 2;
  n: Record<
    string,
    {
      k: 0 | 1 | 2 | 3;
      s?: number; // bytes where applicable
      d?: string; // optional description
      e?: Array<[string, number] | [string, number, number]>;
    }
  >;
};
```

Edges are outgoing tuples:

- `[targetId, kindMask]` (explicit-only)
- `[targetId, kindMask, resMask]`

Per `(source,target)` there MUST be at most one tuple (merge by OR’ing masks).

### `dependency.state.json` v2 schema (assistant-authored)

```ts
type DependencyStateEntryV2 =
  | string
  | [string, number]
  | [string, number, number]; // nodeId, depth, kindMask

type DependencyStateFileV2 = {
  v: 2;
  i: DependencyStateEntryV2[]; // include
  x?: DependencyStateEntryV2[]; // exclude (excludes win)
};
```

Semantics:

- `string` implies `[nodeId, 0, 7]`
- `[nodeId, depth]` implies kindMask `7`
- traversal is outgoing-only, depth-limited, filtered by kindMask
- excludes win: `S \ X`

## Host-private staging verification map (engine-owned)

Because assistant-facing meta omits hashes, integrity-sensitive staging verification MUST be performed using an engine-owned, host-private mapping file under `<stanPath>/context/`:

- `dependency.map.json` (v1; regenerated each `run -c`)

Recommended shape:

```ts
type DependencyMapV1 = {
  v: 1;
  nodes: Record<
    string,
    { id: string; locatorAbs: string; size: number; sha256: string }
  >;
};
```

- `id` is the canonical nodeId (archive address) used by `dependency.meta.json`.
- `locatorAbs` is a transient absolute path on the host.
- `size` and `sha256` are verified against the bytes at `locatorAbs` before staging.

stan-context does not manage this file; it is defined and written by stan-core.
