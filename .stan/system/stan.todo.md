# stan.todo.md (stan-context)

This document tracks the near-term implementation plan for `@karmaniverous/stan-context`.

## Next up

- Dependency context compaction (interop)
  - Provide a compact, assistant-friendly encoding for `dependency.meta.json` and `dependency.state.json` (v2), including stable decode tables.
  - Add a stan-context helper to encode a `DependencyGraph` into compact meta form (edge merging, masks, minified output).
  - Extend selection helper to accept compact bitmask `edgeKinds` in state entries.
  - Document interop for stan-core and stan-cli via `.stan/interop/**` notes.
  - After downstream adoption, validate end-to-end:
    - staging verification still rejects mismatches deterministically
    - closure traversal semantics remain identical to pre-v2 behavior
    - archive.meta.tar contains the compact state and meta as expected

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
  - `src/stan-context/providers/ts/reexportTraversal/*` — AST-first forwarding/traversal helpers (SRP split)

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
- Cleaned up Next up after suite went green.
- Removed unused deps and exported referenced graph types.
- Exported remaining graph types to satisfy TypeDoc.
- Updated package metadata and moved to ESM-only packaging.
- Removed Rollup CJS output (ESM-only build).
- Added GraphNode.description and maxErrors option.
- Fixed lint and Vitest SSR issues after adding descriptions.
- Validated full suite after description/maxErrors changes.
- Added exported ESLint rule for module doc prose.
- Fixed ESLint rule reporting + SSR test instability.
- Improved eslint rule messaging and report location.
- Made doc-tag extraction and eslint rule tag-agnostic.
- Fixed typed-lint issues in eslint rule implementation.
- Added shared docblock scanner to ignore strings.
- Wired docblock scanner into descriptions; fixed SSR test imports.
- Fixed reexportTraversal test to use named exports (SSR).
- Updated requirements and guide for tunneling ergonomics.
- Updated dev plan to close requirements/implementation gaps.
- Closed req/impl gap: truncation + forwarding traversal.
- SOLID/DRY: split traversal modules; renamed tunnel helper; DRY tests.
- Documentation pass: align docs with current behavior.
- Expanded guide for core/cli integration.
- ESLint: ignore test/spec files in recommended config.
- Docs: describe ESLint ignorePatterns and test defaults.
- Reviewed stan-core interop notes; updated reqs/plan.
- Implemented summarizeDependencySelection helper (main export) + tests.
- Added hashSizeEnforcement option (warn default) + tests.
- Fixed lint/test regressions for interop helpers.
- Stabilized hashSizeEnforcement tests and helper lint.
- Fix typed-lint false positives in selection helper.
- Docs: fully specify selection helper contract.
- Interop: drop nodes-only mode; require injected TypeScript.
- Docs: align integration guidance with TS injection.
- Docs: clarify TS injection precedence and throw semantics.
- Docs: mirror TS injection contract in README.
- Breaking: remove anchors from selection config (includes/excludes only).
- Cleanup: remove patch-failure listing headers from docs.
- Docs: document TypeScript load error propagation (cause).
- Docs: clarify typescriptPath entry module + interop.
- Docs: make typescriptPath CJS constraint explicit; record ESM option.
- Interop: add compact dependency meta/state v2 encoding + docs.
- Fix v2 meta encoder typecheck/lint regressions.
- Docs: export meta v2 types to satisfy TypeDoc.
- Docs: export meta v2 constants to satisfy TypeDoc.