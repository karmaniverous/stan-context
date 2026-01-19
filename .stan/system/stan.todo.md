# stan.todo.md (stan-context)

This document tracks the near-term implementation plan for `@karmaniverous/stan-context`.

## Next up

- Incrementalism
  - Fix `src/stan-context/core/incremental.test.ts` parse error and re-run:
    - `npm run lint`
    - `npm run typecheck`
    - `npm run test`
- Documentation
  - Add `guides/stan-assistant-guide.md` (usage contract) for stan-context.

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
- Switched tunneling to barrel export-name lookup.
- Chose AST-first re-export traversal; recorded in requirements.
- Implemented AST-first re-export traversal service + unit tests.
- Fixed traversal typing and external `.d.ts` parsing fallback.
- Fixed lint-only name checks in re-export traversal.
- Stabilized traversal unit tests under Vitest SSR.
- Validated lint/typecheck/test are green after tunneling work.
- Cleaned up Next up to reflect current state.
- Added incremental planning tests for dirty propagation.
- Added stan-context assistant guide.
