# stan.todo.md (stan-context)

This document tracks the near-term implementation plan for `@karmaniverous/stan-context`.

## Next up

- Establish source scaffolding (provider model)
  - Create core modules under `src/core/` (types, paths, hashing, Universe scan, incremental planner, merge/serialize).
  - Create provider interfaces under `src/providers/` and a TypeScript provider under `src/providers/ts/`.
  - Re-export the public API from `src/index.ts`.
- Implement Universe scan (core)
  - Discover files with `fast-glob` (POSIX-normalized repo-relative paths).
  - Apply selection in a deterministic order:
    - `.gitignore` filtering (baseline)
    - `includes` (re-include even if gitignored; can also re-include `node_modules/**`)
    - `excludes` (deny; highest precedence)
    - `anchors` (high-precedence allow; may override excludes + gitignore, but not implicit `.git/**`).
  - Always apply implicit exclusions:
    - `.git/**` (hard)
    - `node_modules/**` (hard unless explicitly re-included)
  - Emit `source` nodes for every file in the Universe with `metadata.size` + `metadata.hash`.
- Implement incremental planning (core)
  - Compare current `nodes` hashes against `previousGraph` to detect changed/new/deleted.
  - Build an in-memory reverse-dependency index by inverting `previousGraph.edges`.
  - Compute `dirty` = changed ∪ reverseDeps(changed) (vital for barrel tunneling correctness).
- Implement TypeScript provider (ts/js)
  - Load `compilerOptions` from `tsconfig.json` (ignore tsconfig include/exclude for file selection).
  - Create a Program with Universe-supported files as `rootNames` (`.ts/.tsx/.js/.jsx/.d.ts`).
  - For each dirty file:
    - Extract explicit edges (static imports/exports, top-level `require`, and `import()` as `dynamic`).
    - Resolve each target to a NodeId and kind (`source`/`external`/`builtin`/`missing`).
    - Hash any resolved `external` files (and mark `isOutsideRoot` when physical path is outside `cwd`).
    - Perform barrel tunneling for named/default imports (explicit edge to barrel + implicit edge(s) to defining file(s)).
    - Do not tunnel namespace imports (`import * as Ns`).
  - Implement external “Commander rule”
    - Shallow resolution by default (entry point only).
    - Follow re-exports within the same nearest-`package.json` boundary.
- Merge and finalize graph (core)
  - Merge provider output into the base Universe graph.
  - Ensure `graph.edges` contains a key for every `graph.nodes` key (empty `[]` when none).
  - De-duplicate edges by `(source, target, kind, resolution)`.
  - Sort edges deterministically (target, then kind, then resolution).
  - Serialize deterministically (sorted node keys; stable metadata key ordering when present).
- Tests (Vitest)
  - Universe scan precedence (gitignore/includes/excludes/anchors + implicit exclusions).
  - NodeId normalization (POSIX separators; Windows drive paths `C:\...` → `C:/...`).
  - Node kind behavior:
    - builtin normalization (`fs` → `node:fs`)
    - missing specifier produces `kind: 'missing'` with no metadata
    - outside-root resolved node sets `metadata.isOutsideRoot: true`
  - Provider behavior:
    - JSON import emits an edge when TS resolves it
    - barrel tunneling (named/default + `export *`; multi-declaration merges → multiple implicit edges)
    - namespace import does not tunnel
    - external commander rule follows within package boundary only
  - Incrementalism:
    - dirty includes reverse deps
    - external hash changes cause dependent re-analysis
  - No-TypeScript mode: nodes-only graph + stable warning in `errors`
- Documentation
  - Add `guides/stan-assistant-guide.md` for stan-context once the public API and module layout are in place.

## Design snapshot (keep in sync while implementing)

- Public entrypoint
  - `generateDependencyGraph(opts: GraphOptions): Promise<GraphResult>`
- Provider contract (core-owned interface)
  - Input: `cwd`, Universe file list, dirty NodeIds, and TS resolution options (provider-specific).
  - Output: additional/updated nodes (deps discovered during resolution) + outgoing edges for analyzed sources.
- Determinism rules (must be enforced in core, not providers)
  - `nodes` serialized with sorted keys.
  - `edges` is a complete map (key for every node).
  - Each `edges[source]` array is de-duplicated and sorted.
  - Node metadata is sparse; when present, metadata keys are ordered deterministically (`hash`, `isOutsideRoot`, `size`).
- Proposed module boundaries (keep each file < 300 LOC)
  - `src/core/types.ts` — graph schema types (NodeId, GraphNode, GraphEdge, DependencyGraph, result types)
  - `src/core/paths.ts` — POSIX normalization + NodeId helpers (`isOutsideRoot`, repo-relative vs absolute)
  - `src/core/hash.ts` — size + SHA-256 helpers (no caching; deterministic)
  - `src/core/universe.ts` — glob + ignore + config selection → Universe file list
  - `src/core/incremental.ts` — dirty-set computation using `previousGraph`
  - `src/core/merge.ts` — merge + de-dup + sorting + “complete edges map”
  - `src/providers/types.ts` — provider interfaces/types
  - `src/providers/ts/tsconfig.ts` — load compilerOptions (only)
  - `src/providers/ts/program.ts` — createProgram + compiler host helpers
  - `src/providers/ts/imports.ts` — extract explicit dependencies + edge kind classification
  - `src/providers/ts/resolve.ts` — resolve specifiers → NodeId/kind (builtin/external/source/missing)
  - `src/providers/ts/tunnel.ts` — barrel tunneling (symbol-aware; excludes namespace imports)
  - `src/providers/ts/externals.ts` — commander rule (package boundary walk)

## Risks / watch-outs

- Large repos: creating a Program over the full Universe may be expensive; evaluate whether Program creation can be kept stable while limiting per-file work to `dirty`.
- ESM/CJS edge cases: dynamic `import()` and `require()` classification is best-effort; keep rules consistent and covered by tests.
- External resolution portability: pnpm store paths and symlinks must be represented faithfully (physical paths) to avoid “fake certainty”.

## Completed

- Captured clarified graph schema, invariants, and implementation plan (requirements + todo).
