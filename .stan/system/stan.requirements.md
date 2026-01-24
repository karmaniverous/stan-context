# STAN — Requirements (stan-context)

This document defines the durable requirements for `@karmaniverous/stan-context` (“stan-context”), the “Context Compiler” package.

stan-context scans a repository and produces a deterministic, serializable dependency graph (“the Map”) for consumption by `stan-core`.

## Vision & role

- Pure analysis engine: no `.stan/` persistence, archiving, patching, or CLI/TTY behavior.
- Stateless: accepts file system access + config inputs; returns JSON data.
- Provider-based: core orchestrates; language providers analyze.

## Architecture (core + providers)

- Core (`src/stan-context/core/`)
  - Defines the canonical graph schema and normalization rules.
  - Scans the Universe (repo file discovery and selection).
  - Computes hashes/sizes and performs incremental invalidation.
  - Delegates language analysis to providers and merges results.
- Providers (`src/stan-context/providers/`)
  - Implement language-specific analysis and tunneling.
  - Default provider: TypeScript/JavaScript provider using the TypeScript Compiler API.
  - Provider contract: accepts a list of source NodeIds to analyze and returns nodes/edges to merge.

## Data model (DependencyGraph)

The output graph MUST be JSON-serializable and deterministic.

### NodeId

`NodeId` is a string with these canonical forms:

- Source file: POSIX repo-relative path (e.g., `src/index.ts`).
- External file: POSIX repo-relative path under repo root when possible (e.g., `node_modules/.pnpm/pkg@1.2.3/node_modules/pkg/index.d.ts`).
- Outside-root resolved file: POSIX-normalized absolute path (e.g., `C:/Users/me/dev/lib/index.d.ts`).
- Builtin module: `node:<name>` (e.g., `node:fs`).
- Missing/unresolved module: the import specifier (e.g., `./missing-file`).

### Graph shape

```ts
export type NodeId = string;

export type GraphNodeKind = 'source' | 'external' | 'builtin' | 'missing';
export type GraphLanguage = 'ts' | 'js' | 'json' | 'md' | 'other';

export type GraphNodeMetadata = {
  size?: number;
  hash?: string;
  isOutsideRoot?: true;
};

export type GraphNode = {
  id: NodeId;
  kind: GraphNodeKind;
  language: GraphLanguage;
  /**
   * Optional one-line summary for the node (TS/JS only).
   * Omitted when no suitable module documentation is available.
   */
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
  /** Outgoing adjacency list. MUST contain a key for every NodeId in `nodes`. */
  edges: Record<NodeId, GraphEdge[]>;
};
```

### Node requirements

- `nodes` MUST contain an entry for every discovered file in the Universe.
- Node kinds:
  - `source`: file on disk intended to represent the repo Universe (including non-code files).
  - `external`: file resolved from dependencies (commonly under `node_modules`), including pnpm physical paths.
  - `builtin`: Node.js built-in modules, normalized to `node:<name>`.
  - `missing`: unresolved specifier (no file on disk).
- `language` is derived from file extension; for `builtin` and `missing`, use `other`.

### Metadata requirements (sparse)

- `metadata` is optional and MUST be sparse to reduce payload size.
- Omit fields when they would be `null`/falsey:
  - omit `size` if unknown/not applicable,
  - omit `hash` if unknown/not applicable,
  - omit `isOutsideRoot` unless it is `true`.
- Required hashing:
  - `source` and `external` nodes MUST have `metadata.size` and `metadata.hash`.
  - `builtin` and `missing` nodes MUST NOT have `metadata.hash` (omit).
- Outside-root:
  - Any node whose resolved physical path is outside `cwd` MUST set `metadata.isOutsideRoot: true`.

### Description requirements (TS/JS only; optional)

- `GraphNode.description` is optional and SHOULD be omitted unless it provides useful summary information.
- Description gathering is invoked by core orchestration but implemented by the TS/JS provider.
- Description eligibility:
  - Node kind MUST be `source` or `external`.
  - Node language MUST be `ts` or `js` (including `.d.ts` as `ts`).
- Source annotation:
  - The provider MUST look for a `/** ... */` doc comment containing one or more configured TSDoc tags.
  - Tags MUST be passed in as strings that include the `@` prefix and match `/^@\w+$/`.
  - Default tags: `@module` and `@packageDocumentation`.
  - The description MUST be derived from the prose portion of the same doc comment block that contains the tag.
  - The tag text itself MUST NOT be used as the description.
  - If the prose resolves to an empty string after cleanup, omit the description.
- Cleanup/normalization:
  - Strip comment markup (`/**`, `*/`, leading `*`).
  - Remove tag lines (`@...`).
  - Best-effort remove common inline markup (e.g., `{@link ...}`, Markdown links, inline code backticks).
  - Normalize to a single line (collapse whitespace to single spaces and trim).
- Truncation:
  - The provider MUST truncate to a strict prefix of exactly `nodeDescriptionLimit` characters and append ASCII `...` when truncated.
  - The appended `...` is not counted toward `nodeDescriptionLimit`.
  - No trimming or whitespace normalization is permitted after truncation slicing.
    - Formally: if `text.length > N`, description is `text.slice(0, N) + '...'`.
- Candidate selection (entropy):
  - The provider MUST scan all doc blocks for each configured tag and choose the usable candidate with the longest cleaned prose (highest entropy).
  - Among configured tags, choose the candidate that yields the longer final description string after truncation.
  - Tie-break: choose the earliest tag in the configured tag list.
- Docblock detection correctness:
  - The provider MUST ignore doc-comment-shaped sequences that appear inside string literals and template literals (e.g., `` `/** @module */` ``).

### Edge requirements

- The graph stores only module-level relationships (file → file/module). No symbol/function/class nodes.
- Edges are directional: `sourceNodeId` (implicit by `edges[sourceNodeId]`) → `target`.
- Edge kinds:
  - `runtime`: static `import`/`export` dependencies and top-level `require()`.
  - `dynamic`: any `import()` expression (even at top level); optionally dynamic `require()` inside functions.
  - `type`: `import type` / `export type`, plus best-effort semantic “type-only” detection when cheap; otherwise fall back to `runtime`.
- Edge `resolution`:
  - `explicit`: directly imported module/file (architectural dependency).
  - `implicit`: barrel-tunneled dependency to the defining module (physical dependency).

Constraints:

- De-duplication: the tuple `(source, target, kind, resolution)` MUST be unique.
- Determinism:
  - Node keys in `nodes` are serialized in sorted key order.
  - `edges` MUST contain a key for every node ID in `nodes` (even if `[]`).
  - Edge lists MUST be sorted deterministically (target, then kind, then resolution).
  - When `metadata` fields are present, their key ordering MUST be deterministic (`hash`, `isOutsideRoot`, `size`).

## Universe scanning (defining “source”)

Inputs:

- `cwd` (repo root).
- Config selection:
  - `includes?: string[]` (additive allow; can override `.gitignore`),
  - `excludes?: string[]` (deny; highest precedence).

Base behavior:

- Scan using `fast-glob` and POSIX-normalize all paths.
- Respect `.gitignore` rules (unless re-included by `includes`).
- Implicit exclusions (always applied unless explicitly re-included via `includes`):
  - `.git/**`
  - `node_modules/**`
- `stan-context` is not required to hardcode `<stanPath>` reserved denials; `stan-core` supplies those via `config.excludes`.
- Every file in the Universe becomes a `source` node, even if it produces no edges.

## TypeScript/JavaScript provider (default)

Supported source extensions:

- `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`

Program creation:

- The Universe scan determines the set of “source files” to analyze.
- Load `tsconfig.json` ONLY to obtain `compilerOptions` (paths/baseUrl/jsx/moduleResolution/etc.).
- Do NOT use tsconfig `include`/`exclude` to choose files; pass Universe file list as `rootNames`.
- If `tsconfig.json` is missing/invalid, use permissive defaults (at minimum `allowJs: true`).

Module resolution outcomes:

- Builtins:
  - Normalize `fs` → `node:fs` using Node’s builtin module list (`module.builtinModules`).
- Source outside Universe but on disk:
  - Create a `source` node with `size` and `hash` and include it in the graph.
- External:
  - Resolve to the physical file path; create an `external` node with `size` and `hash`.
  - If the resolved physical path is outside `cwd`, use absolute NodeId and set `metadata.isOutsideRoot: true`.
- Missing/unresolved:
  - Create a `missing` node with `id` equal to the specifier and no metadata.

JSON imports:

- If TypeScript resolves `import data from './x.json'`, emit a normal edge to the JSON node (which exists from Universe scan).

### Barrel tunneling (symbol-aware implicit edges)

- For named/default imports that resolve through a barrel (`index.ts`), emit:
  - an explicit edge to the barrel module, and
  - implicit edges to the defining module(s) of the imported symbol(s).
- Tunneling MUST be symbol-aware:
  - link only to the module(s) that declare the specific imported symbol,
  - if a symbol merges declarations across multiple files, emit one implicit edge per declaring file.
- `export * from` MUST participate in tunneling.
- Namespace imports (`import * as Ns from ...`) MUST NOT be tunneled; keep only the explicit edge to the barrel.

#### Re-export resolution strategy (robustness requirement)

Re-export barrels are primarily a syntactic forwarding graph (e.g., `export { X } from './x'`, `export type { X } from './x'`, `export * from './x'`). To avoid brittle behavior across TypeScript versions and `.d.ts` externals, the TS provider MUST implement tunneling through re-exports using an AST-first strategy:

- For named re-exports (`export { X } from './x'` and `export type { X } from './x'`):
  - Treat the `moduleSpecifier` and exported-name mapping as the primary source of truth.
  - Follow the forwarding chain deterministically (barrel → target module → next re-export, etc.) until reaching a defining module.
- For star re-exports (`export * from './x'`):
  - Use a focused lookup to determine whether the target module exports the requested name, then recurse into that module.
  - The TypeChecker MAY be used for this membership check, but it SHOULD be limited in scope and memoized/cached to avoid creating a fragile “symbol chase” dependency.
- Symbol/alias chasing via the TypeChecker MUST NOT be the primary mechanism for resolving re-export chains (it is acceptable only as a fallback for “defining declaration files” once the correct target module is identified).

Additional forwarding forms (must be supported)

- Default export definitions count as “defining” `default`:
  - `export default <expr>` (export assignment)
  - `export default function ...` and `export default class ...` (default modifiers)

- “Import then export” forwarding MUST participate in traversal:
  - `import { A as B } from './x'; export { B as C };`
  - `import Foo from './x'; export { Foo as Bar };` (forwarded `default`)
  - `import * as Ns from './x'; export { Ns as NamedNs };` (namespace forwarding)
  - `export * as Ns from './x';` (namespace forwarding)

Namespace forwarding semantics (important)

- When the requested export name resolves to a namespace binding that was imported via `import * as Ns from '<m>'` and re-exported (with or without renaming):
  - The traversal MUST treat the target as the imported module `<m>` itself (module-level dependency), not as a symbol-level export name.
  - Tunneling MUST emit an implicit edge to the resolved module file for `<m>`.
  - The provider MUST NOT attempt to expand namespace forwarding into declaration files via symbol lookup (there is no meaningful “exportName” to resolve on the target module for the namespace object).

### External dependencies (“Commander rule”)

- Default external behavior is shallow:
  - Resolve an import to its external entry point and stop (do not analyze the external’s dependencies).
- Commander rule:
  - If the external entry point is a barrel that re-exports from files within the same package, follow those re-exports and include those internal package files as external nodes/edges.
  - Boundary: “same package” is defined by nearest `package.json`. Stop when re-exports cross into a different nearest-`package.json` context.
- Workspace/monorepo linking:
  - If a resolved dependency is physically within the repo root and is not under `node_modules/**`, treat it as `source`.

## Incrementalism (previousGraph)

- `generateDependencyGraph` accepts `previousGraph` for incremental rebuilds.
- Hashing:
  - Compute SHA-256 for all current Universe `source` files.
  - Compute SHA-256 for any `external` files that appear in the graph (resolved during analysis).
- Dirty detection:
  - Re-analyze changed/new/deleted files.
  - Also re-analyze reverse dependencies (files that import changed files), to keep barrel tunneling correct.
- Persisted state is owned by `stan-core`; stan-context treats `previousGraph` as an opaque JSON input.

## Dependencies and graceful degradation

- TypeScript is required for TS/JS analysis and MUST be provided explicitly by the host.
  - stan-context MUST support both:
    - module injection (`GraphOptions.typescript`), and
    - absolute entry-path injection (`GraphOptions.typescriptPath`).
  - stan-context MUST NOT attempt an implicit/ambient `require('typescript')` fallback.
  - If TypeScript cannot be loaded from injected inputs, `generateDependencyGraph` MUST throw an actionable error that includes underlying failure details.
  - Current contract (implemented): `typescriptPath` is loaded via `require()` (using `createRequire(import.meta.url)`), so it MUST point to a CommonJS entry module file that exports the TypeScript compiler API.
  - Future-proofing option (not yet implemented):
    - stan-context SHOULD support ESM entry modules for `typescriptPath` by attempting `import(pathToFileURL(typescriptPath).href)` when `require()` fails with `ERR_REQUIRE_ESM` (or equivalent), then normalizing `mod.default ?? mod` before validation.
- Hashing uses `node:crypto`.

## API contract (initial)

```ts
export type GraphOptions = {
  cwd: string;
  /**
   * Injected TypeScript module instance to use for TS/JS analysis.
   * Callers MUST provide either `typescript` or `typescriptPath`.
   */
  typescript?: typeof import('typescript');
  /**
   * Absolute path to a TypeScript entry module to load.
   * (For example, `require.resolve('typescript')` from the host environment.)
   */
  typescriptPath?: string;
  config?: {
    includes?: string[];
    excludes?: string[];
  };
  previousGraph?: DependencyGraph;
  hashSizeEnforcement?: 'warn' | 'error' | 'ignore';
  nodeDescriptionLimit?: number;
  /**
   * TSDoc tags to consider for TS/JS module descriptions (strict `@` prefix).
   */
  nodeDescriptionTags?: string[];
  maxErrors?: number;
};

export type GraphResult = {
  graph: DependencyGraph;
  stats: {
    modules: number;
    edges: number;
    dirty: number;
  };
  errors: string[];
};

export function generateDependencyGraph(
  opts: GraphOptions,
): Promise<GraphResult>;
```

## Packaging and module system

- `@karmaniverous/stan-context` MUST be ESM-only.
  - Package metadata MUST NOT provide a CommonJS entrypoint (`exports["."].require`).
  - The `main` entry (if present) MUST point to an ESM build output.
- Distribution outputs:
  - Runtime JS MUST be emitted as ESM (e.g., `dist/mjs/**`).
  - Types MUST be emitted (e.g., `dist/types/**`).
- Consumers that use `require()` are out of scope (they should receive an “exports not defined” / ESM-only failure).

## ESLint plugin (published contract)

- The package MUST publish an ESLint plugin subpath export:
  - Import path: `@karmaniverous/stan-context/eslint`
  - The default export is an ESLint plugin object with:
    - `rules` containing `require-module-description`
    - `configs.recommended` enabling `stan-context/require-module-description` at `warn`

- Rule contract: `stan-context/require-module-description`
  - Warns when a TS/JS module lacks usable module documentation prose.
  - Tag selection is tag-agnostic and strict:
    - configured tags MUST be `@`-prefixed and match `/^@\w+$/`
    - default tags are `@module` and `@packageDocumentation`
  - Semantics MUST match `GraphNode.description` extraction:
    - prose-only from a docblock containing a configured tag (tag text is not used)
    - cleanup/normalization rules are the same
    - docblock detection ignores comment-shaped sequences in strings/templates

## Runtime configuration knobs (non-semantic)

- `nodeDescriptionLimit` (default: 160)
  - Limits GraphNode.description prefix length; 0 disables descriptions.
  - ASCII `...` is appended when truncated (ellipsis not counted in the prefix).
- `nodeDescriptionTags` (default: `['@module', '@packageDocumentation']`)
  - Declares which TSDoc tags are considered for TS/JS descriptions.
  - Tags MUST include the `@` prefix and match `/^@\w+$/`.
- `maxErrors` (default: 50)
  - Limits GraphResult.errors length; 0 disables errors output.
  - When truncation occurs, the last entry MUST be a deterministic sentinel.

## Interop: selection closure + budgeting helpers (stan-core)

stan-core/stan-cli implement context-mode budgeting and need deterministic summaries of dependency selection closure size without reading file bodies.

### Helper: summarize dependency selection closure + bytes

- The package MUST export a helper from the main entrypoint that computes selection closure membership and aggregate sizing from an in-memory `DependencyGraph` plus include/exclude state entries.
- The helper MUST NOT change the graph schema and MUST NOT require reading file bodies.
- Proposed contract (shape; naming may evolve but semantics must remain stable):
  - `summarizeDependencySelection({ graph, include, exclude, options }) -> summary`
  - Inputs:
    - `graph`: `DependencyGraph` (as returned by `generateDependencyGraph`)
    - `include` / `exclude`: entries in the STAN dependency-state tuple forms:
      - `string | [nodeId, depth] | [nodeId, depth, edgeKinds[]]`
    - `options`:
      - `defaultEdgeKinds` (default: `['runtime','type','dynamic']`)
      - `dropNodeKinds` (default: drop `builtin` and `missing` from the returned selection)
      - `maxTop` (default small; deterministic)
  - Output summary MUST include:
    - `selectedNodeIds: string[]` (sorted deterministically)
    - `selectedCount: number`
    - `totalBytes: number` (sum of `metadata.size` where present; missing treated as `0` but warned)
    - `largest: Array<{ nodeId: string; bytes: number }>` (top-N by bytes; deterministic tie-breaking)
    - `warnings: string[]` (deterministic ordering)

Selection semantics (must match dependency state closure rules):

- Expansion MUST traverse outgoing edges only.
- Expansion MUST be depth-limited, where:
  - depth `0` includes only the seed node
  - depth `N` includes nodes reachable within `N` outgoing-edge traversals, filtered by `edgeKinds`
- `edgeKinds` filtering:
  - When omitted in an entry, use `options.defaultEdgeKinds`.
  - Only `runtime`, `type`, and `dynamic` are valid kinds; invalid kinds MUST be ignored and warned deterministically.
- Excludes win:
  - Expand `include` to a closure set `S`.
  - Expand `exclude` to a closure set `X` using the same traversal semantics.
  - Final selection is `S \ X`.

Node handling:

- Unknown node IDs (present in state, absent from `graph.nodes`) MUST be retained in `selectedNodeIds` with bytes `0` and MUST produce a warning (do not silently drop).
- `builtin` and `missing` node kinds SHOULD be excluded from the final selection by default via `dropNodeKinds`, with deterministic warnings indicating what was dropped.

### Budgeting semantics: `metadata.size` is bytes

- `GraphNode.metadata.size` MUST represent the on-disk file size in bytes for real file nodes that are hashed (`source` and `external`).
- Consumers MAY treat `bytes / 4` as an approximate token heuristic; tokenization is out of scope for stan-context.

### Configurable enforcement: `metadata.hash` implies `metadata.size`

- When analyzing or normalizing graphs, stan-context MUST treat the invariant “if `metadata.hash` is present for a file node, `metadata.size` should also be present” as a supported contract.
- Because incremental inputs may include older or hand-constructed graphs, enforcement MUST be configurable:
  - Default behavior: emit deterministic warnings (surface via `GraphResult.errors` and/or helper `warnings`).
  - Strict behavior (opt-in): treat violations as errors (fail the operation deterministically).
  - Ignore behavior (opt-in): do not warn or error on violations.
- The stable runtime knob is `hashSizeEnforcement` with values:
  - `'warn'` (default), `'error'`, `'ignore'`.
