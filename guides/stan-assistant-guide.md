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
  - `typescriptPath` MUST be an absolute filesystem path (for example from `require.resolve('typescript')` in the host environment).
  - `typescriptPath` MUST point to an entry module file that exports the TypeScript compiler API (not a package root). Common examples are `.../typescript/lib/typescript.js` and `.../tsserverlibrary.js` (VS Code SDK), as long as the module exports the same API surface.
  - Interop: injected `typescript` modules are normalized as `mod.default ?? mod` for validation; `typescriptPath` is loaded via `require()`, so it MUST point to a CommonJS entry module.
  - Constraint (current): ESM-only entry modules are not supported via `typescriptPath`. If your host only has an ESM entrypoint, inject `typescript` instead.
  - Future option (tracked in requirements): widen `typescriptPath` loading to support both CJS and ESM via `import()` fallback on `ERR_REQUIRE_ESM`, with `mod.default ?? mod` normalization.

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
  config?: {
    includes?: string[];
    excludes?: string[];
  };
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
  - Error propagation:
    - if `typescriptPath` is provided but loading fails, the thrown error message includes the underlying loader failure, and the original error is preserved as `error.cause` (Node >= 20).
    - if TypeScript is missing (no injection) or `typescript` is invalid, there is no underlying loader error to propagate.
- `GraphResult.errors` is reserved for non-fatal warnings (for example, hash/size invariant warnings when `hashSizeEnforcement: 'warn'`).

Incremental usage:

- Pass `previousGraph` from your persisted state to reuse edges and limit analysis to a “dirty” set.

Runtime options:

- `nodeDescriptionLimit` (default: 160)
  - Produces `GraphNode.description` for TS/JS nodes based on a real `/** ... */` doc comment containing `@module` or `@packageDocumentation`.
  - Uses the prose portion only (tag text is ignored).
  - Normalizes to a single line; when truncated, keeps a strict prefix of exactly `nodeDescriptionLimit` characters and appends ASCII `...` (ellipsis not counted in the prefix).
  - Set to `0` to omit descriptions entirely.
- `nodeDescriptionTags` (default: `['@module', '@packageDocumentation']`)
  - Controls which TSDoc tags are considered for description extraction (TS/JS only).
  - Tags MUST include the `@` prefix and match `^@\w+$`.
- `maxErrors` (default: 50)
  - Caps the number of returned `errors` entries to avoid runaway output.
  - When truncation occurs, the final entry is a deterministic sentinel string.
  - Set to `0` to omit errors entirely.
- `hashSizeEnforcement` (default: `'warn'`)
  - Controls enforcement of the invariant:
    - if `metadata.hash` is present for a file node, `metadata.size` should also be present.
  - Default behavior is to emit deterministic warnings (via `GraphResult.errors`).
  - `'error'` throws (strict); `'ignore'` is silent.

## Graph schema (practical contract)

The returned `graph` is deterministic and JSON-serializable:

- `graph.nodes` keys are sorted.
- `graph.edges` is a complete map: it contains a key for every node ID (empty array means “no outgoing edges”).
- Each `graph.edges[source]` list is de-duplicated and sorted deterministically.

Nodes are module-level (file-level) only:

- Node IDs (`NodeId`) are stable strings:
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
- `graph.nodes[id].metadata.hash` is a SHA-256 content hash (when applicable).
- For `source` and `external` nodes, `size` and `hash` are expected to be present.
- For `builtin` and `missing` nodes, `metadata` is omitted.

Edges:

- Only outgoing adjacency lists are stored (`edges[sourceId] -> GraphEdge[]`).
- `GraphEdge.kind`:
  - `runtime`: static imports/exports and top-level `require()`
  - `type`: `import type` / `export type` and best-effort type-only detection
  - `dynamic`: `import()` and some `require()` calls in function scope
- `GraphEdge.resolution`:
  - `explicit`: directly imported module/file
  - `implicit`: barrel-tunneled dependency to the defining module (or module-level target for namespace forwarding)

## Token budgeting and caching (consumer guidance)

`metadata.size` (bytes) is a useful heuristic, but it is not a reliable token-count proxy.

For accurate prompt budgeting:

- Compute token counts in the consumer (stan-core selection layer) using the tokenizer/model you will call.
- Cache computed token counts keyed by `metadata.hash` (sha256) so you only re-tokenize when file content changes.

## Selection summary helper (budgeting support)

stan-context exports a pure helper to compute dependency selection closure membership and aggregate sizing (bytes) from an in-memory `DependencyGraph` plus dependency-state entries.

This is intended to help consumers (e.g., stan-core/stan-cli context mode) produce deterministic “selection reports” without reimplementing closure logic and without reading file bodies.

Import:

```ts
import {
  summarizeDependencySelection,
  type DependencyStateEntry,
} from '@karmaniverous/stan-context';
```

Usage:

```ts
const include: DependencyStateEntry[] = [['src/index.ts', 2, ['runtime']]];
const exclude: DependencyStateEntry[] = [];

const summary = summarizeDependencySelection({
  graph,
  include,
  exclude,
  options: {
    // defaults: ['runtime','type','dynamic']
    defaultEdgeKinds: ['runtime', 'type', 'dynamic'],
    // defaults: drop builtin/missing
    dropNodeKinds: ['builtin', 'missing'],
    maxTop: 10,
    // default: 'warn'
    hashSizeEnforcement: 'warn',
  },
});
```

Contract (v1):

- Entry forms (`DependencyStateEntry`):
  - `nodeId`
  - `[nodeId, depth]`
  - `[nodeId, depth, edgeKinds]`
  - `[nodeId, depth, kindMask]` (compact; runtime=1, type=2, dynamic=4; 7 = all)
- Traversal semantics:
  - outgoing edges only
  - depth-limited expansion:
    - depth `0`: seed only
    - depth `N`: include targets reachable within `N` outgoing-edge traversals
  - `edgeKinds` filtering:
    - valid kinds: `runtime` | `type` | `dynamic`
    - when omitted, `defaultEdgeKinds` is used
    - invalid kinds are ignored and produce deterministic warnings
  - `kindMask` filtering (compact alternative to `edgeKinds`):
    - runtime = `1`, type = `2`, dynamic = `4`, all = `7`
    - invalid bits are ignored and produce deterministic warnings
- Excludes win:
  - expand include closure `S`
  - expand exclude closure `X` using the same traversal semantics
  - final selection is `S \ X`
- Node handling:
  - unknown node IDs (present in state, absent from `graph.nodes`) are retained with bytes `0` and produce warnings
  - builtin/missing nodes are dropped by default (configurable) and produce warnings indicating what was dropped
- Size semantics:
  - `totalBytes` is the sum of `metadata.size` (bytes) for selected nodes where present
  - missing sizes are treated as `0` and produce warnings
  - consumers may use a deterministic heuristic `estimatedTokens ≈ totalBytes / 4`
- Determinism guarantees:
  - `selectedNodeIds` is sorted lexicographically
  - `largest` is sorted by bytes descending, tie-break by nodeId ascending
  - `warnings` is sorted lexicographically
- Hash/size invariant enforcement (`hashSizeEnforcement`):
  - `'warn'` (default): add warnings when a hashed file node is missing `metadata.size`
  - `'error'`: throw when a hashed file node is missing `metadata.size`
  - `'ignore'`: suppress hashed-node warnings/errors

## Authoring practices for STAN-enabled repos (recommended)

These conventions are not required for correctness, but they materially improve the quality and precision of the dependency graph (and therefore improve STAN’s context selection).

### Prefer named imports/exports over namespace patterns

- Prefer named/default imports when you want precise tunneling:
  - `import { Foo } from './barrel'`
  - `import Foo from './barrel'`

- Avoid namespace imports when you care about physical dependency precision:
  - `import * as Ns from './barrel'` does not tunnel by design.
  - It produces a coarser “depends on barrel” edge, which can cause broader context selection than necessary.

### Prefer direct re-exports on package/barrel surfaces

When hoisting internal modules to a package export surface (e.g., `index.ts`):

- Prefer direct re-exports:
  - `export { Foo } from './foo'`
  - `export type { Foo } from './foo'`

- “Import then export” forwarding is supported, but prefer direct re-exports for clarity and tooling-friendliness:
  - `import { Foo } from './foo'; export { Foo };`

- Namespace forwarding is supported but intentionally coarser:
  - `import * as Ns from './foo'; export { Ns };`
  - When consumers import `Ns`, stan-context treats it as a module-level dependency and tunnels only to the target module file (not to symbol-level declaration files). Prefer named exports when you want per-symbol precision.

### Write usable module/package doc prose (helps both graph + ESLint)

- Add real `/** ... */` doc comments with prose for module entrypoints and package documentation:
  - Use `@module` and/or `@packageDocumentation` and include a short prose summary in the same docblock.
  - Tag-only docblocks (no prose) are treated as unusable and will:
    - omit `GraphNode.description`, and
    - trigger `stan-context/require-module-description` warnings (if enabled).

### Use type-only syntax to improve edge classification

- Prefer `import type { T } from './x'` and `export type { T } from './x'` when the dependency is type-only. This improves the signal in `GraphEdge.kind`.

## Graph schema and invariants (high level)

The graph is deterministic and JSON-serializable:

- `graph.nodes` keys are sorted.
- `graph.edges` is a complete map: it contains a key for every node ID (empty array means “no outgoing edges”).
- Edges are de-duplicated by `(source, target, kind, resolution)` and sorted by `(target, kind, resolution)`.

### NodeId forms

Node IDs are stable strings:

- Repo-relative POSIX paths for in-repo files (e.g., `src/index.ts`)
- POSIX-normalized absolute paths when outside the repo root (e.g., `C:/x/y.d.ts`)
- Builtins: `node:fs`
- Missing/unresolved: the original specifier (e.g., `./nope`)

### Node kinds

- `source`: a file discovered by the Universe scan
- `external`: a resolved dependency file (commonly under `node_modules`)
- `builtin`: a Node.js builtin module (`node:<name>`)
- `missing`: an unresolved module specifier

### Node descriptions (TS/JS)

- `GraphNode.description` is optional.
- It is produced for TS/JS nodes (`source` and `external`) when a suitable doc comment is present and `nodeDescriptionLimit > 0`.
- It is omitted when no prose is found.

### Edge kinds and resolution

- `kind`: `runtime` | `type` | `dynamic`
- `resolution`: `explicit` | `implicit`

Interpretation:

- explicit edges represent direct imports/exports.
- implicit edges represent “tunneled” dependencies (barrels/re-exports), intended to capture the physical dependency on the defining module.

## TypeScript provider behavior (important)

Source extensions analyzed:

- `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`

Resolution outcomes:

- builtins normalize to `node:<name>`
- missing specifiers create `missing` nodes
- external resolution follows physical paths (pnpm store paths are preserved)

### Barrel tunneling (re-exports)

To keep tunneling robust across TypeScript versions and `.d.ts` externals:

- Re-export barrels are treated as a _syntactic forwarding graph_.
- Tunneling through re-exports is **AST-first**:
  - named re-exports (`export { X } from './x'`, `export type { X } from './x'`) follow `moduleSpecifier` chains deterministically
  - star re-exports (`export * from './x'`) participate in tunneling as well
- Additional supported forwarding forms (also AST-first):
  - namespace re-exports (`export * as Ns from './x'`) are treated as module-level forwarding
  - “import then export” forwarding:
    - named (`import { A as B } from './x'; export { B as C }`)
    - default (`import Foo from './x'; export { Foo as Bar }`)
    - namespace (`import * as Ns from './x'; export { Ns as NamedNs }`)
- The system **always chases** until reaching a “true defining file” (a module that defines the requested export locally, not merely forwarding it).

Namespace forwarding note:

- When an exported name resolves to a forwarded namespace object, stan-context treats it as a module-level dependency and tunnels to the target module file only (no symbol-level declaration expansion).

### External “commander rule”

For external entrypoints, tunneling is bounded:

- Follow re-exports only within the nearest `package.json` boundary of the external package.
- Do not tunnel across package boundaries (prevents pulling in unrelated transitive dependency packages).

## Integration patterns (stan-core and stan-cli)

This section describes how to integrate stan-context without relying on any stan-context internal modules.

### Integrating in stan-core (engine)

Recommended responsibilities for the engine layer:

- Call `generateDependencyGraph({ cwd, config, previousGraph, ... })` during an archive/snapshot workflow.
  - Use the same `cwd` and selection config (`includes`/`excludes`) that you use for archiving so the graph aligns with the archived Universe.
- Accept TypeScript injection from the host adapter (stan-cli / IDE extension / service) and pass it through to stan-context.
  - Prefer module injection when possible.
- Persist `previousGraph` in engine-owned state to enable incremental rebuilds.
  - Use `graph.nodes[id].metadata.hash` (sha256) to cache any derived metadata (especially token counts).
- Store/embed the graph JSON in the archived context so the assistant can select files using the map.
  - A common pattern is writing a deterministic JSON file under the STAN workspace (for example under `<stanPath>/system/`), but the exact path is consumer-defined.
- Treat `errors` as user-facing warnings (non-fatal).
  - `maxErrors` exists to prevent runaway output volume on pathological repos.

### Integrating in stan-cli (CLI adapter)

Recommended responsibilities for the CLI layer:

- Orchestrate the run loop (scripts -> outputs -> archives) by calling into stan-core.
- Do not call stan-context directly from the CLI unless there is a compelling reason.
  - Preferred: stan-core owns the optional dependency and exposes a clean “graph generation” seam to the CLI.
- Ensure TypeScript is provided explicitly to stan-context:
  - Prefer module injection (`typescript: ts`) when possible.
  - Otherwise pass `typescriptPath` (absolute path, for example from `require.resolve('typescript')` in the host environment).
    - ESM host example:
      - `const require = createRequire(import.meta.url);`
      - `const typescriptPath = require.resolve('typescript');`
  - If TypeScript cannot be provided (or loading fails), `generateDependencyGraph` throws; surface that error to the user (the message is intended to be actionable).
- Keep configuration single-source-of-truth:
  - pass selection config (`includes`/`excludes`) through to the engine, and let the engine pass it to stan-context.

## ESLint plugin (optional)

stan-context publishes an ESLint plugin subpath export:

```ts
import stanContext from '@karmaniverous/stan-context/eslint';

export default [
  {
    plugins: { 'stan-context': stanContext },
    rules: {
      // Equivalent to enabling the rule directly:
      // 'stan-context/require-module-description': 'warn',
      ...stanContext.configs.recommended.rules,
    },
  },
];
```

The rule shares the same “usable prose” semantics as `GraphNode.description`.

### Test files are ignored by default (recommended config)

`stanContext.configs.recommended` configures `stan-context/require-module-description` to ignore common test/test-like files by default (for example `*.test.*`, `*.spec.*`, and `test`/`tests`/`__tests__` directory patterns) across TS/JS-like extensions.

This is intended to avoid noisy warnings in tests/fixtures where module-level documentation is not typically useful.

### Rule option: `ignorePatterns`

You can customize or extend the ignore set using `ignorePatterns` (glob patterns):

```ts
import stanContext from '@karmaniverous/stan-context/eslint';

export default [
  {
    plugins: { 'stan-context': stanContext },
    rules: {
      ...stanContext.configs.recommended.rules,
      'stan-context/require-module-description': [
        'warn',
        { ignorePatterns: ['**/*.test.ts', '**/*.spec.ts'] },
      ],
    },
  },
];
```

To enforce the rule in tests too, override with `ignorePatterns: []`.

## Common integration pitfalls

- Always persist and pass `previousGraph` if you want incremental behavior.
- Always pass `typescript` or `typescriptPath`; there is no ambient TypeScript resolution.
- Ensure `typescript` is installed in the host environment that injects it (for example, stan-cli).
- If you supply `typescriptPath`, it must be absolute; prefer `createRequire(import.meta.url).resolve('typescript')` in ESM hosts.
- Do not assume `node_modules/**` is in the Universe; it is implicitly excluded unless explicitly included (analysis may still discover external nodes via resolution).
- If you want precise tunneling through barrels, avoid patterns that obscure the symbol-level dependency (especially namespace imports/exports). Prefer direct named re-exports and named imports to help stan-context produce the most actionable graph.
- Do not treat `metadata.size` as token count; compute tokens in the consumer and cache by `metadata.hash`.

## Compact dependency context meta/state (host interop)

Some STAN hosts implement “context mode” by writing an assistant-facing `dependency.meta.json` (map) and reading an assistant-authored `dependency.state.json` (directives). These files are host-owned; stan-context provides the underlying dependency graph and may provide helpers to support compact encoding.

Stable decode tables (prompt-guaranteed for assistants in context mode):

- Node kind index:
  - `0` = source
  - `1` = external
  - `2` = builtin
  - `3` = missing
- Edge kind mask:
  - runtime = `1`, type = `2`, dynamic = `4`, all = `7`
- Edge resolution mask (meta only; optional):
  - explicit = `1`, implicit = `2`, both = `3`
  - if omitted: explicit-only

State v2 entry compact form (host interop):

- `string` (nodeId only)
- `[nodeId, depth]`
- `[nodeId, depth, kindMask]` where kindMask is the edge kind bitmask

Meta v2 edge compact form (host interop):

- edges are outgoing tuples:
  - `[targetId, kindMask]`
  - `[targetId, kindMask, resMask]`
- hosts should merge multiple edges per target into one tuple by OR’ing masks.
