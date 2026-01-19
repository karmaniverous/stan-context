# stan.todo.md (stan-context)

This document tracks the near-term implementation plan for `@karmaniverous/stan-context`.

## Next up

- Fix TS provider tunneling for re-export barrels (current test failures)
  - Ensure `ExportSpecifier` declarations resolve to the defining file(s) for:
    - `export { X } from './x'`
    - `export type { X } from './x'`
  - Keep the commander-rule package-boundary filter applied only for external
    barrels.
- Establish source scaffolding (provider model)
  - Stabilize the TS provider implementation under strict linting rules:
    - Avoid deprecated TS AST properties (use `phaseModifier`-based detection).
    - Use `hasOwnProperty` guards when reading `Record<...>` maps across graph instances.
  - Add incremental-specific tests:
    - dirty includes reverse deps closure
    - external hash changes cause dependent re-analysis
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
  - `src/stan-context/types.ts` — graph schema types + helpers
  - `src/stan-context/core/paths.ts` — POSIX normalization + NodeId helpers
  - `src/stan-context/core/hash.ts` — size + SHA-256 helpers
  - `src/stan-context/core/universe.ts` — glob + ignore + config selection
  - `src/stan-context/core/incremental.ts` — dirty-set computation using `previousGraph`
  - `src/stan-context/core/finalize.ts` — merge/de-dup/sort + “complete edges map”
  - `src/stan-context/providers/ts/load.ts` — optional TS loader (no dynamic import)
  - `src/stan-context/providers/ts/tsconfig.ts` — load compilerOptions (only)
  - `src/stan-context/providers/ts/moduleResolution.ts` — resolve specifiers (builtin/missing/file)
  - `src/stan-context/providers/ts/extract.ts` — extract explicit deps + tunnel requests
  - `src/stan-context/providers/ts/tunnel.ts` — symbol-aware tunneling + commander boundary filter
  - `src/stan-context/providers/ts/analyze.ts` — analyze dirty sources and emit nodes/edges

## Completed

- Captured clarified graph schema, invariants, and implementation plan (requirements + todo).
- Removed stan-core template identity from repo metadata/docs/config.
- Moved implementation watch-outs to stan.project.md.
- Implemented Universe scan + nodes-only graph scaffold with tests.
- Replaced dynamic import TS loader; fixed parse/lint warnings.
- Adopted TSDoc escaping policy; fixed comment escapes.
- Fixed strict lint/typecheck issues after TS provider wiring.
- Switched package boundary detection to package-directory.
- Improved tunneling to follow re-exports and pass tests.
- Removed deprecated isTypeOnly usage; fixed tunneling via export lookup.
- Fixed Vitest mock leakage by isolating TS loader mocks.
- Fixed TS program SourceFile lookup for tunneling on Windows.
- Fixed re-export tunneling via ExportSpecifier symbols.
- Switched tunneling to importer-side symbol resolution.
- Fixed re-export tunneling to follow ExportSpecifier targets.
