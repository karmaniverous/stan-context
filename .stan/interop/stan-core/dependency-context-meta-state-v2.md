# Dependency context — compact meta/state v2 (assistant-facing)

This note is intended for stan-core (engine) integration and, specifically,
for inclusion in the assistant’s system prompt so the assistant can:

- decode `.stan/context/dependency.meta.json` v2 correctly, and
- author `.stan/context/dependency.state.json` v2 correctly.

## Files and roles

- `dependency.meta.json` (v2): the Map (graph + per-node metadata)
- `dependency.state.json` (v2): the Directives (assistant selection intent)

Both files MUST be small enough to live in LLM context while preserving
precise reasoning signal (NodeIds remain full path strings).

## Stable decode tables (MUST be in system prompt)

### Node kind (`meta.n[nodeId].k`)

- `0` = `source` (repo files selected by Universe scan)
- `1` = `external` (resolved deps, often under node_modules)
- `2` = `builtin` (Node builtins; NodeId typically `node:<name>`)
- `3` = `missing` (unresolved specifiers; NodeId is the specifier)

### Edge kind mask (meta edges + state directives)

Bitmask integer where:

- `1` (`0b001`) = runtime
- `2` (`0b010`) = type
- `4` (`0b100`) = dynamic
- `7` (`0b111`) = all kinds

### Edge resolution mask (meta only; optional)

- `1` (`0b01`) = explicit
- `2` (`0b10`) = implicit (tunneled)
- `3` (`0b11`) = both

If omitted, resolution defaults to explicit-only (`1`).

## dependency.meta.json v2 schema (compact)

High-level:

```ts
type DependencyMetaV2 = {
  v: 2;
  n: Record<
    string,
    {
      k: 0 | 1 | 2 | 3;
      s?: number; // bytes
      h?: string; // 128-bit base64url (no padding)
      d?: string; // optional description
      e?: Array<[string, number] | [string, number, number]>;
    }
  >;
};
```

### Edges (meta.n[nodeId].e)

Edges are **outgoing** adjacency list entries, stored as tuples to reduce size:

- `[targetId, kindMask]`
- `[targetId, kindMask, resMask]`

Rules:

- There MUST be at most one edge per `(source,target)` pair.
- If multiple underlying edges exist between the same pair, they are merged:
  - `kindMask` is OR’d across runtime/type/dynamic bits.
  - `resMask` is OR’d across explicit/implicit bits.
- If merged `resMask` is explicit-only (`1`), the 2-tuple form is used and the
  `resMask` value is omitted to save tokens.

### Hash representation (meta.n[nodeId].h)

For `source` and `external` nodes, `h` is used for integrity-sensitive staging
verification.

Encoding:

- compute SHA-256 digest of the file bytes
- take the first 16 bytes (128-bit prefix)
- encode as base64url without padding

This short hash is intended to be safe in practice when paired with `s` (size).

## dependency.state.json v2 schema (assistant-authored)

```ts
type DependencyStateEntryV2 =
  | string
  | [string, number]
  | [string, number, number]; // nodeId, depth, kindMask

type DependencyStateFileV2 = {
  v: 2;
  i: DependencyStateEntryV2[]; // include
  x?: DependencyStateEntryV2[]; // exclude (optional; excludes win)
};
```

### State semantics (how to reason and author correctly)

- `nodeId` is always a NodeId string from `dependency.meta.json` (or a literal
  specifier for `missing` nodes).
- `depth`:
  - `0` includes only the seed node
  - `N` includes nodes reachable within N outgoing-edge traversals
- `kindMask` filters which edges are traversed:
  - omitted => treat as `7` (runtime|type|dynamic)
  - `1` => runtime only
  - `2` => type only
  - `4` => dynamic only

Excludes win:

- expand include closure S
- expand exclude closure X
- final selection = S \\ X

## Assistant authoring tips (practical)

- Prefer targeting a small number of seed nodes and use depth expansion.
- Use `kindMask=1` (runtime-only) when you want to avoid pulling in type-only
  dependencies; use `kindMask=2` for type-only exploration.
- Exclude broad subtrees by excluding a top-level barrel node at depth >= 1,
  but prefer depth 0 excludes for pinpoint removals.

## Compatibility note

If older v1 state exists (string edgeKinds arrays), the host may either:

- migrate it to v2, or
- support both formats during a transition.

For assistant prompts, prefer describing v2 only to reduce confusion.
