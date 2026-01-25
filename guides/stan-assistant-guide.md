# STAN assistant guide — stan-context

This guide is a compact, self-contained usage contract for `@karmaniverous/stan-context` (“stan-context”). It is written so a STAN assistant (or human) can integrate the package correctly without consulting `.d.ts` files or other docs.

## What this package is (mental model)

`@karmaniverous/stan-context` is the **context compiler** for STAN:

- It scans a repository (“Universe”) and builds a deterministic dependency graph (“the Map”).
- The graph is consumed by higher-level tools (e.g., `stan-core`/`stan-cli`) to select the right files to read.

This package does **not**:

- create archives or diffs,
- manage `.stan/` state,
- apply patches,
- implement CLI/TTY behavior.

## Runtime requirements

- Node: `>= 20`
- Packaging: ESM-only
- TypeScript: **required** (`>= 5`)
  - The host MUST provide TypeScript explicitly via `GraphOptions.typescript` or `GraphOptions.typescriptPath` (otherwise `generateDependencyGraph` throws).
  - If both `typescript` and `typescriptPath` are provided, `typescript` takes precedence.
  - `typescriptPath` MUST be an absolute filesystem path.
  - `typescriptPath` MUST point to a CommonJS entry module file that exports the TypeScript compiler API (it is loaded via `require()`).
  - Constraint (current): ESM-only entry modules are not supported via `typescriptPath`; inject `typescript` instead.

## Public API

### `generateDependencyGraph(opts)`

Import:

```ts
import { generateDependencyGraph } from '@karmaniverous/stan-context';
```

Contract-level signature:

```ts
type GraphOptions = {
  cwd: string;
  typescript?: typeof import('typescript');
  typescriptPath?: string;
  config?: { includes?: string[]; excludes?: string[] };
  previousGraph?: DependencyGraph;
  hashSizeEnforcement?: 'warn' | 'error' | 'ignore';
  nodeDescriptionLimit?: number;
  nodeDescriptionTags?: string[];
  maxErrors?: number;
};

type GraphResult = {
  graph: DependencyGraph;
  stats: { modules: number; edges: number; dirty: number };
  errors: string[];
};

declare function generateDependencyGraph(
  opts: GraphOptions,
): Promise<GraphResult>;
```

Behavior:

- Always performs a Universe scan (gitignore + includes/excludes) and hashes discovered files.
- Requires TypeScript for TS/JS analysis:
  - callers MUST provide `typescript` or `typescriptPath` or the call throws.
  - emits outgoing edges and performs barrel “tunneling” for named/default imports (implicit edges).
  - TypeScript load failures are fatal (throw); they are not reported via `GraphResult.errors`.
- `GraphResult.errors` is reserved for non-fatal warnings and provider best-effort notes.

## Graph schema (practical contract)

The returned `graph` is deterministic and JSON-serializable:

- `graph.nodes` keys are sorted.
- `graph.edges` is a complete map: it contains a key for every node ID (empty array means “no outgoing edges”).
- Each `graph.edges[source]` list is de-duplicated and sorted deterministically.

Nodes are module-level (file-level) only.

Node IDs (`NodeId`) are stable strings:

- repo-relative POSIX paths for in-repo files (e.g., `src/index.ts`)
- POSIX-normalized absolute paths when outside the repo root (e.g., `C:/x/y.d.ts`)
- builtins: `node:fs`
- missing/unresolved: the original specifier (e.g., `./nope`)

Node kinds:

- `source`: a file discovered by the Universe scan (includes non-code files)
- `external`: a resolved dependency file (commonly under `node_modules`, but may be outside-root absolute)
- `builtin`: a Node.js builtin module (`node:<name>`)
- `missing`: an unresolved module specifier (no file on disk)

Node metadata (important for consumers):

- `graph.nodes[id].metadata.size` is the file size in bytes (when applicable).
- `graph.nodes[id].metadata.hash` is a SHA-256 content hash (hex) for real file nodes (when applicable).

Edges:

- Only outgoing adjacency lists are stored (`edges[sourceId] -> GraphEdge[]`).
- `GraphEdge.kind`:
  - `runtime`: static imports/exports and top-level `require()`
  - `type`: `import type` / `export type` and best-effort type-only detection
  - `dynamic`: `import()` and some `require()` calls in function scope
- `GraphEdge.resolution`:
  - `explicit`: directly imported module/file
  - `implicit`: barrel-tunneled dependency to the defining module (or module-level target for namespace forwarding)

## Selection helper (budgeting support)

stan-context exports a pure helper to compute dependency selection closure membership and aggregate sizing (bytes) from an in-memory `DependencyGraph` plus dependency-state entries.

Import:

```ts
import {
  summarizeDependencySelection,
  type DependencyStateEntry,
} from '@karmaniverous/stan-context';
```

Entry forms (`DependencyStateEntry`):

- `nodeId`
- `[nodeId, depth]`
- `[nodeId, depth, edgeKinds]`
- `[nodeId, depth, kindMask]` (compact; runtime=1, type=2, dynamic=4; 7 = all)

Semantics:

- Traversal is outgoing edges only.
- Depth-limited:
  - depth `0`: seed only
  - depth `N`: include nodes reachable within `N` traversals
- Filtering:
  - `edgeKinds`: only follow edges whose `kind` matches
  - `kindMask`: only follow edges where `mask & edge.kindBit !== 0`
- Excludes win:
  - expand include closure `S`
  - expand exclude closure `X`
  - final selection = `S \ X`

Determinism:

- `selectedNodeIds` sorted lexicographically
- `largest` sorted by bytes desc, tie-break by nodeId asc
- `warnings` sorted lexicographically

## Dependency context artifacts (context mode interop)

When a host enables “dependency context mode”, two assistant-facing files live in archives:

- `.stan/context/dependency.meta.json` (v2): the Map (graph for traversal + budgeting)
- `.stan/context/dependency.state.json` (v2): the Directives (assistant intent)

Important split (engine-owned contract):

- Assistant-facing `dependency.meta.json` is optimized for LLM context and MUST omit content hashes.
- Integrity-sensitive staging verification MUST use a separate engine-owned, host-private mapping file:
  - `.stan/context/dependency.map.json` (contains canonical nodeId → locatorAbs + size + full sha256)

### Stable decode tables (must be in the system prompt)

Node kind index (`meta.n[nodeId].k`):

- `0` = source
- `1` = external
- `2` = builtin
- `3` = missing

Edge kind mask bits (used in meta edges and state directives):

- runtime = `1`
- type = `2`
- dynamic = `4`
- all = `7`

Edge resolution mask bits (meta only; optional):

- explicit = `1`
- implicit = `2`
- both = `3`
- if omitted: explicit-only

Resolution masks are informational but useful for assistant reasoning.

## Compact dependency meta encoder (host interop)

stan-context exports a pure helper that encodes a standard `DependencyGraph` into a compact v2 meta object intended for minified JSON:

```ts
import { encodeDependencyMeta } from '@karmaniverous/stan-context';
```

Contract (v2 meta produced by `encodeDependencyMeta`):

- `meta.v === 2`
- nodes are keyed by NodeId under `meta.n`
- `node.k` is a numeric kind index (0..3)
- edges are tuples under `node.e`:
  - `[targetId, kindMask]` (explicit-only)
  - `[targetId, kindMask, resMask]` (explicit/implicit/both)
- hashes are omitted from assistant-facing meta (integrity lives in `dependency.map.json`)

The host (stan-core/stan-cli/other) is responsible for:

- persisting meta/state under `.stan/context/`
- staging/verifying external dependency bytes using `dependency.map.json`
- including meta/state in `archive.meta.tar` (thread opener)

## ESLint plugin (optional)

stan-context publishes an ESLint plugin subpath export: `@karmaniverous/stan-context/eslint`.

The rule `stan-context/require-module-description` warns when a TS/JS module lacks usable prose for configured TSDoc tags (defaults: `@module` and `@packageDocumentation`).
