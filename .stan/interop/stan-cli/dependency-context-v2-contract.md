# Dependency context v2 — CLI adapter contract (stan-cli)

This document describes stan-cli responsibilities as the adapter that triggers
dependency context mode.

Ownership boundary:

- stan-core owns the file formats, semantics, and safety rules for:
  - `<stanPath>/context/dependency.meta.json` (assistant-facing; no hashes)
  - `<stanPath>/context/dependency.state.json` (assistant-authored directives)
  - `<stanPath>/context/dependency.map.json` (engine-owned, host-private)
- stan-cli owns:
  - flag parsing / orchestration (`stan run -c`)
  - injecting TypeScript into stan-context via stan-core seams
  - user-facing logging/TTY behavior

## Trigger point: `stan run -c`

During `stan run -c`, stan-cli must:

- ensure dependency context mode is enabled in the engine call
- ensure TypeScript is provided (see below)
- rely on stan-core to:
  - generate `dependency.meta.json` and `dependency.map.json`
  - stage selected externals into `<stanPath>/context/**`
  - include `dependency.meta.json` and `dependency.state.json` in the meta archive

## TypeScript injection (required)

Because stan-core’s dependency graph build uses `@karmaniverous/stan-context`,
TypeScript must be provided explicitly.

stan-cli should provide either:

- `typescript` module injection (preferred), or
- `typescriptPath` absolute path to a CJS TypeScript entry module.

## Files produced (conceptual)

Under `<stanPath>/context/`:

- `dependency.meta.json` (v2) — assistant-facing Map:
  - minified JSON
  - no hashes
  - includes: node kinds, sizes, optional descriptions, compact edges w/ masks
- `dependency.state.json` (v2) — assistant-authored Directives:
  - minified JSON
  - includes/excludes with depth and kindMask bitmask
- `dependency.map.json` (v1) — engine-owned host-private mapping:
  - minified JSON
  - canonical nodeId → locatorAbs + size + full sha256
  - used only for staging verification

Staged bytes (archive-addressable):

- `<stanPath>/context/npm/**`
- `<stanPath>/context/abs/**`

## Archiving expectations

stan-cli should ensure that in context mode:

- `archive.meta.tar` includes:
  - `<stanPath>/context/dependency.meta.json`
  - `<stanPath>/context/dependency.state.json` (when present)
  - system prompt and other opener artifacts per engine contract
- `dependency.map.json` should NOT be included in assistant-facing archives
  (it is host-private and regenerated each run).

## Pretty vs minified output

Default: minified JSON for meta/state/map.

Escape hatch: stan-cli may expose a `--pretty` option that instructs stan-core to
pretty-print these files for debugging (not recommended for inclusion in
archives).

## How to apply selection

stan-cli should treat `dependency.state.json` as a configuration input only:

- it expresses assistant intent (seeds + depth + kindMask)
- the engine performs traversal using `dependency.meta.json`
- staging is validated using `dependency.map.json`

If state is missing, the engine should behave deterministically (e.g., empty
includes; no staged externals), per engine defaults.
