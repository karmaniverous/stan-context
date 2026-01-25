# Dependency context v2 — engine contract (stan-core)

This document defines the engine-owned contract for dependency context mode.

It is “host-private” in the sense that these artifacts are produced and
consumed by the host+engine during `stan run -c`, but the **file formats and
semantics are owned by stan-core** so that non-CLI hosts can drive the same
workflow correctly.

Definitions (local):

- **Canonical nodeId**: the archive address (path) by which the assistant can
  request and the engine can include bytes in archives.
- **Locator**: a transient source-of-truth filesystem path used only by the host
  to stage bytes (never required in assistant context).

## Artifacts (under `<stanPath>/context/`)

### Assistant-facing (archived; must fit in LLM context)

- `dependency.meta.json` (v2) — Map (graph + sizing + optional descriptions)
  - Purpose:
    - dependency traversal (closure selection)
    - budgeting (bytes via `s`)
    - reasoning (nodeId path signal + optional `d` + resolution masks)
  - MUST NOT contain content hashes (to preserve LLM budget).

- `dependency.state.json` (v2) — Directives (assistant-authored)
  - Purpose:
    - include/exclude seeds with depth + edge-kind filtering (bitmask)

### Host-private (engine-owned; regenerated each `run -c`)

- `dependency.map.json` — Canonical mapping + verification material
  - Purpose:
    - map canonical nodeId → source locator (locatorAbs) for staging
    - stage verification via full sha256 + size
  - This file is not intended to be included in assistant context archives.

## Canonical nodeId invariant (engine-owned)

Engine invariant:

- Canonical nodeIds are archive-addressable paths.
- External nodes MUST be normalized to paths under:
  - `<stanPath>/context/npm/**` (npm/package externals)
  - `<stanPath>/context/abs/**` (outside-root absolutes)
- Repo files remain repo-relative (e.g., `src/index.ts`).
- Builtins and missing remain their semantic IDs (e.g., `node:fs`, `./nope`).

The assistant-facing `dependency.meta.json` MUST use canonical nodeIds
exclusively so that selecting a nodeId corresponds directly to an archive path.

## Stable decode tables (MUST be in system prompt in context mode)

These decode tables MUST be documented to the assistant by the host (stan-core
prompt/guide), and MUST be implemented identically by all hosts.

### Node kind index (`meta.n[nodeId].k`)

- `0` = source
- `1` = external
- `2` = builtin
- `3` = missing

### Edge kind mask bits (meta edges + state directives)

- runtime = `1`
- type = `2`
- dynamic = `4`
- all = `7`

### Edge resolution mask bits (meta only; optional third tuple element)

- explicit = `1`
- implicit = `2`
- both = `3`
- if omitted: explicit-only

Resolution masks are informational today but useful for assistant reasoning.

## dependency.meta.json (v2) — assistant-facing Map (no hashes)

The Map MUST be minified by default (no pretty whitespace).

Schema:

```ts
type MetaV2 = {
  v: 2;
  n: Record<
    string,
    {
      k: 0 | 1 | 2 | 3;
      /** file size (bytes) when applicable */
      s?: number;
      /** optional description */
      d?: string;
      /**
       * outgoing edges (compact tuples)
       * - [to, kindMask] (explicit-only)
       * - [to, kindMask, resMask]
       */
      e?: Array<[string, number] | [string, number, number]>;
    }
  >;
};
```

Edge merging requirement:

- At most one edge tuple per `(source,target)` pair.
- Merge by OR’ing masks:
  - `kindMask` OR across runtime/type/dynamic bits
  - `resMask` OR across explicit/implicit bits
- If merged `resMask` is explicit-only (`1`), omit it (2-tuple form).

## dependency.state.json (v2) — assistant-authored Directives

The state MUST be minified by default.

Schema:

```ts
type EntryV2 =
  | string
  | [string, number]
  | [string, number, number]; // nodeId, depth, kindMask

type StateV2 = {
  v: 2;
  i: EntryV2[]; // include
  x?: EntryV2[]; // exclude (excludes win)
};
```

Semantics:

- `string` implies `[nodeId, 0, 7]`
- `[nodeId, depth]` implies kindMask `7`
- `kindMask` filters traversal by edge kind bitmask
- Excludes win: expand S and X and subtract (`S \ X`)

## dependency.map.json — engine-owned locator + verification map

This file is regenerated every `stan run -c` and is intended to be consumed only
by the engine/host during staging.

It binds canonical nodeIds (archive addresses) to transient source locators and
strong verification material.

Schema (v1):

```ts
type DependencyMapV1 = {
  v: 1;
  nodes: Record<
    string,
    {
      /** canonical nodeId used by dependency.meta.json */
      id: string;
      /** source locator on local disk (absolute path) */
      locatorAbs: string;
      /** bytes */
      size: number;
      /** sha256 hex digest of file bytes */
      sha256: string;
    }
  >;
};
```

Notes:

- `nodes` should include only file nodes that may require staging (externals),
  but it MAY also include source nodes if helpful for debugging; the assistant
  should not rely on this file.
- This file MUST NOT be required for closure traversal; traversal uses
  `dependency.meta.json` only.

## Host behavior contract (engine-owned)

On `run -c`:

- Generate or refresh:
  - `dependency.meta.json` (assistant-facing)
  - `dependency.map.json` (host-private)
- Ensure `dependency.state.json` is included in the meta archive if present.

Staging verification:

- Determine which canonical nodeIds must be staged based on selection closure.
- For each required staged nodeId:
  - look up `dependency.map.json.nodes[nodeId]`
  - hash the bytes at `locatorAbs` and verify:
    - `size` matches
    - `sha256` matches
  - then copy bytes into `<stanPath>/context/**` at the canonical nodeId path

Budgeting:

- Use `dependency.meta.json` node sizes (`s`) as authoritative bytes where present.

## Interop with stan-context helpers

- `@karmaniverous/stan-context` exports:
  - `summarizeDependencySelection(graph, include/exclude)` which supports v2
    `kindMask` in state entries.
- stan-core may inflate `dependency.meta.json` to the `DependencyGraph` shape
  and call `summarizeDependencySelection` to reuse closure semantics.

If inflating:

- `GraphEdge.resolution` may be set to `'explicit'` everywhere for traversal,
  but consider surfacing meta’s resolution masks separately for assistant UX.
