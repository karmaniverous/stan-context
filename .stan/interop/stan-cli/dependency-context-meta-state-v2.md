# Dependency context — compact meta/state v2 (stan-cli integration)

This note describes how stan-cli should generate and consume:

- `.stan/context/dependency.meta.json` (v2, compact)
- `.stan/context/dependency.state.json` (v2, compact; assistant-authored)

Primary goals:

- Reduce context size without harming assistant reasoning.
- Preserve integrity-sensitive staging verification for external files.

## Decode tables (host-side constants)

Node kind index (`meta.n[nodeId].k`):

- 0 source
- 1 external
- 2 builtin
- 3 missing

Edge kind mask:

- runtime = 1
- type = 2
- dynamic = 4
- all = 7

Edge resolution mask (meta only; optional third tuple element):

- explicit = 1
- implicit = 2
- both = 3
- if omitted: default explicit-only (1)

## meta v2: generation

### Inputs

- The current on-disk dependency graph produced by the context compiler
  (`@karmaniverous/stan-context`).
- Deterministic graph semantics MUST be preserved:
  - nodes are stable IDs (paths/specifiers)
  - outgoing edges only

### Encoding rules

- Nodes remain keyed by NodeId (string) to preserve assistant reasoning signal.
- Node object keys are short (`k`, `s`, `h`, `d`, `e`) to reduce size.
- Edges are stored as tuples and merged:
  - at most one edge per (source,target)
  - `kindMask` = OR of runtime/type/dynamic bits across all edges to the target
  - `resMask` = OR of explicit/implicit bits across all edges to the target
- If merged `resMask` is explicit-only (1), omit it and store the 2-tuple
  `[targetId, kindMask]`.

### Hash encoding (integrity)

For file nodes where hashes are present, meta stores a compact form:

- compute SHA-256 digest over file bytes
- take first 16 bytes (128-bit prefix)
- base64url encode with no padding

Recommended verification for staging:

- verify `size` (bytes) matches
- verify 128-bit digest prefix matches

## meta v2: parsing

### Basic shape

```ts
type MetaV2 = { v: 2; n: Record<string, Node> };
type Edge = [string, number] | [string, number, number];
```

Edge decoding:

- `[to, k]` => kindMask = k; resMask = 1
- `[to, k, r]` => kindMask = k; resMask = r

### Traversal for closure selection

When expanding dependency state selections:

- traverse outgoing edges only
- respect `depth` limits
- filter edges by kindMask:
  - follow edge if `(edge.kindMask & requestedKindMask) !== 0`

Resolution mask is informational only unless explicitly used by a consumer.

## state v2: assistant-authored directives

### Basic shape

```ts
type Entry = string | [string, number] | [string, number, number];
type StateV2 = { v: 2; i: Entry[]; x?: Entry[] };
```

Semantics:

- `string` entry means `[nodeId, 0, 7]`
- `[nodeId, depth]` means kindMask defaults to `7`
- `[nodeId, depth, kindMask]` is fully specified

Excludes win:

- expand include closure S
- expand exclude closure X
- selected = S \\ X

## Staging verification (external context)

When copying external files into `.stan/context/**` for inclusion in archives:

- use meta nodes to determine what needs staging
- before copying, verify the source file on disk matches:
  - size (`s`)
  - hash prefix (`h`)
- after copy, optionally verify again against the staged bytes (defense-in-depth)

Failure handling:

- mismatch MUST fail fast with actionable error (do not silently stage)
- if meta hash is absent for a node that requires staging, treat as error

## Pretty vs minified output

- Default: write minified JSON for both meta and state.
- Escape hatch: support a `--pretty` option that writes pretty JSON
  (for debugging only; not intended for archiving).

## Migration

If v1 state exists (string edgeKinds arrays):

- Preferred: migrate on read to v2 bitmask entries.
- Optional: support both v1 and v2 during transition, but write v2.

Do not emit both schemas in the assistant prompt; describe v2 only to keep the
assistant’s authoring behavior deterministic.
