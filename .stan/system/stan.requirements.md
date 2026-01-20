# STAN — Requirements (stan-context)

This document defines the durable requirements for `@karmaniverous/stan-context` (“stan-context”), the “Context Compiler” package.

stan-context scans a repository and produces a deterministic, serializable dependency graph (“the Map”) for consumption by `stan-core`.

## Vision & role

- Pure analysis engine: no `.stan/` persistence, archiving, patching, or CLI/TTY behavior.
- Stateless: accepts file system access + config inputs; returns JSON data.
- Provider-based: core orchestrates; language providers analyze.

## Architecture (core + providers)

- Core (`src/core/`)
  - Defines the canonical graph schema and normalization rules.
  - Scans the Universe (repo file discovery and selection).
  - Computes hashes/sizes and performs incremental invalidation.
  - Delegates language analysis to providers and merges results.
- Providers (`src/providers/`)
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
  - The provider MUST truncate to a prefix of `nodeDescriptionLimit` characters and append ASCII `...` when truncated.
  - The appended `...` is not counted toward `nodeDescriptionLimit`.
- Candidate selection (entropy):
  - The provider MUST scan all doc blocks for each configured tag and choose the usable candidate with the longest cleaned prose (highest entropy).
  - Among configured tags, choose the candidate that yields the longer final description string after truncation.
  - Tie-break: choose the earliest tag in the configured tag list.

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
  - `excludes?: string[]` (deny; highest precedence),
  - `anchors?: string[]` (high-precedence allow; may override excludes and `.gitignore`).

Base behavior:

- Scan using `fast-glob` and POSIX-normalize all paths.
- Respect `.gitignore` rules (unless re-included by `includes`/`anchors`).
- Implicit exclusions (always applied unless explicitly re-included):
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
  - If the resolved physical path is outside `cwd`, use absolute NodeId and set `isOutsideRoot: true`.
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

Re-export barrels are primarily a _syntactic forwarding graph_ (e.g., `export { X } from './x'`, `export type { X } from './x'`, `export * from './x'`). To avoid brittle behavior across TypeScript versions and `.d.ts` externals, the TS provider MUST implement tunneling through re-exports using an AST-first strategy:

- For named re-exports (`export { X } from './x'` and `export type { X } from './x'`):
  - Treat the `moduleSpecifier` and exported-name mapping as the primary source of truth.
  - Follow the forwarding chain deterministically (barrel → target module → next re-export, etc.) until reaching a defining module.
- For star re-exports (`export * from './x'`):
  - Use a focused lookup to determine whether the target module exports the requested name, then recurse into that module.
  - The TypeChecker MAY be used for this membership check, but it SHOULD be limited in scope and memoized/cached to avoid creating a fragile “symbol chase” dependency.
- Symbol/alias chasing via the TypeChecker MUST NOT be the primary mechanism for resolving re-export chains (it is acceptable only as a fallback for “defining declaration files” once the correct target module is identified).

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

- `typescript` is a peer dependency.
  - If it is missing at runtime, Universe scanning and hashing still run and the function returns a nodes-only graph (empty edge lists) plus an error/warning in `errors`.
- Hashing uses `node:crypto`.

## API contract (initial)

```ts
export type GraphOptions = {
  cwd: string;
  config?: {
    includes?: string[];
    excludes?: string[];
    anchors?: string[];
  };
  previousGraph?: DependencyGraph;
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
