# stan-context → stan-core response: summarizeDependencySelection + v2 masks

This is a direct response to:

- `.stan/imports/stan-core/20260125-010100Z-summarize-dependency-selection.md`

It confirms current stan-context behavior and proposes a deterministic external NodeId normalization strategy suitable for context-mode staging + assistant use.

## Confirmations (requested by stan-core)

### Export: summarizeDependencySelection

Confirmed: `summarizeDependencySelection` is exported from the main entrypoint:

```ts
import { summarizeDependencySelection } from '@karmaniverous/stan-context';
```

Related types (including `DependencyStateEntry`) are also exported.

### State entry forms: array-of-kinds and bitmask

Confirmed: `summarizeDependencySelection` accepts state entries in both forms:

- v1-style third element:
  - `edgeKinds: ('runtime'|'type'|'dynamic')[]`
- compact third element:
  - `kindMask: number`
    - runtime = `1`
    - type = `2`
    - dynamic = `4`
    - all = `7`

Notes:

- If the 3rd element is omitted, the helper uses `defaultEdgeKinds` (default is all three).
- Invalid bit(s) in `kindMask` are ignored with deterministic warnings.

### Deterministic output guarantees

Confirmed (per current implementation):

- `selectedNodeIds` is lexicographically sorted.
- `warnings` is lexicographically sorted.
- `largest` is sorted by bytes descending; ties broken by nodeId ascending.

## Preferred minimal input “graph” shape (to avoid adapter guesswork)

The stable input contract is the `DependencyGraph` shape from stan-context:

```ts
type DependencyGraph = {
  nodes: Record<
    string,
    {
      kind: 'source' | 'external' | 'builtin' | 'missing';
      metadata?: { size?: number; hash?: string };
    }
  >;
  edges: Record<
    string,
    Array<{
      target: string;
      kind: 'runtime' | 'type' | 'dynamic';
      resolution: 'explicit' | 'implicit';
    }>
  >;
};
```

For stan-core’s use (closure + budgeting), the effective minimum is:

- `nodes[nodeId].kind` (so builtin/missing can be dropped by default)
- `nodes[nodeId].metadata.size` (bytes) when you want correct `totalBytes`
- `edges[sourceId]` adjacency list (missing key is treated as `[]`)
- `edges[*][].kind` must be one of `runtime|type|dynamic` for filtering

`resolution` is currently ignored by traversal, but required by the type.

## Using summarizeDependencySelection with compact meta v2

If stan-core’s persisted artifact is a compact `dependency.meta.json` (v2), stan-core can either:

- implement closure traversal directly over v2 tuples, or
- inflate a `DependencyGraph` in-memory and call `summarizeDependencySelection`.

If you choose inflation (recommended for reuse and to keep semantics in one place), you can safely ignore resolution for traversal and emit deterministic edges like this:

- For each v2 edge tuple `[to, kindMask]` or `[to, kindMask, resMask]`:
  - if (kindMask & 1) push `{ target: to, kind: 'runtime', resolution: 'explicit' }`
  - if (kindMask & 2) push `{ target: to, kind: 'type', resolution: 'explicit' }`
  - if (kindMask & 4) push `{ target: to, kind: 'dynamic', resolution: 'explicit' }`

This preserves kind-filtering semantics exactly. (Resolution mask is informational unless a consumer explicitly uses it.)

## Deterministic NodeId normalization (external → staged archive paths)

Goal (as stated by stan-core):

- assistant-facing meta must contain **archive-addressable NodeIds** (no OS absolute paths, no pnpm store noise),
- while keeping NodeIds informative enough for assistant reasoning,
- and preserving staging verification (hash/size checks).

Key principle:

- Normalize **only external nodes** into `.stan/context/**` paths.
- Keep in-repo `source` NodeIds unchanged (`src/...`, etc.).

### Canonical staged NodeId families

Use two canonical families for staged externals:

- npm externals:
  - `.stan/context/npm/<pkgName>/<pkgVersion>/<pathInPackage>`
- absolute/outside-root externals:
  - `.stan/context/abs/<sha256hex(locatorAbs)>/<basename>`

Rationale:

- npm form preserves strong reasoning signal:
  - package name + version + internal file path
  - removes pnpm physical-store noise and OS separators
- abs form avoids leaking absolute paths into assistant context while remaining deterministic and collision-resistant.

### Normalization algorithm (deterministic)

Inputs:

- the “raw” graph produced by stan-context (`DependencyGraph`)
- a host-side `stanPath` (here: `.stan`)

Output:

- a rewritten graph (or compact meta) whose NodeIds match staged archive paths

Steps:

1. Build a mapping `M: rawNodeId -> canonNodeId`

For each node in the raw graph:

- If node.kind is `source`:
  - `canonNodeId = rawNodeId` (unchanged)
- If node.kind is `builtin` or `missing`:
  - `canonNodeId = rawNodeId` (unchanged; these are not files)
- If node.kind is `external`:
  - Decide whether it is “npm external” vs “abs external”:
    - If the rawNodeId is repo-relative and under `node_modules/**`:
      - treat as npm external
    - Else (outside-root absolute, or otherwise not a stable repo-relative):
      - treat as abs external

2. For npm externals: derive `<pkgName>`, `<pkgVersion>`, `<pathInPackage>`

Deterministic derivation:

- Find the nearest `package.json` boundary “package root” for the physical file.
- Read the package’s `package.json` and extract:
  - `name` (string) => `<pkgName>`
  - `version` (string) => `<pkgVersion>`
- Compute `pathInPackage` as the POSIX-relative path from that package root to the file.
- Canonical staged NodeId:
  - `.stan/context/npm/<pkgName>/<pkgVersion>/<pathInPackage>`

Notes:

- Preserve `@scope/pkg` as path segments (`@scope/pkg`) rather than flattening.
- POSIX-normalize `pathInPackage` separators (`/`).

3. For abs externals: derive `<sha256hex(locatorAbs)>/<basename>`

Deterministic derivation:

- `locatorAbs` is the absolute filesystem path to the dependency source file.
- Compute `sha256hex(locatorAbs)` over the UTF-8 string of the absolute path.
- `basename` is `path.basename(locatorAbs)` (sanitized only by POSIX normalize).
- Canonical staged NodeId:
  - `.stan/context/abs/<sha256hex(locatorAbs)>/<basename>`

Why full sha256 hex here:

- Abs externals are usually low-count, so the 64-char segment does not dominate context size.
- Using the full hex digest avoids collisions that could overwrite staged files.

4. Rewrite graph nodes and edges using `M`

- New node key set is `canonNodeId`s.
- For each raw node:
  - merge into canonical node bucket (see merge rules below).
- For each edge `rawFrom -> rawTo`:
  - `from = M[rawFrom]`, `to = M[rawTo]`
  - add the edge to the canonical edge list
  - allow duplicates temporarily; de-dup/merge later (deterministic).

5. Merge-collisions (multiple raw nodes mapping to same canonical)

This can happen when the resolver yields different physical paths that represent the same npm package file (e.g., pnpm store vs symlinked path).

Deterministic merge rules:

- Treat it as an invariant that the file bytes match:
  - if hashes (sha256) are present on both raw nodes and differ => error
  - if sizes are present on both and differ => error
- Choose metadata deterministically:
  - prefer a node that has both size+hash present (file node)
  - for `description`, prefer the longer non-empty string (higher entropy); tie-break by lexicographically smaller source rawNodeId

6. Produce assistant-facing compact meta v2

Once the canonical graph is built, encode it into compact meta v2:

- NodeIds in meta are canonical staged paths for externals
- Assistant can select and load these paths directly from archives

### Staging verification coupling

If the assistant-facing NodeIds are canonical staged paths, stan-core still needs to know where to copy from (the source locator). Recommended approach:

- Keep a host-side “sources map” keyed by canonical NodeId that records:
  - `locatorAbs` (absolute source path)
  - optional npm coords (`pkgName`, `pkgVersion`, `pathInPackage`)
- Before staging:
  - verify source bytes match meta’s `s` (size) and `h` (128-bit digest prefix)
- After staging (optional defense-in-depth):
  - verify staged bytes hash/size match meta again

This preserves integrity while keeping assistant-facing meta free of absolute paths.

## Practical recommendation (summary)

- Use `summarizeDependencySelection` as-is (export confirmed).
- For compact meta/state v2:
  - keep NodeIds as strings (paths) for reasoning
  - normalize external nodeIds to staged `.stan/context/**` paths:
    - npm: `.stan/context/npm/<name>/<ver>/<path>`
    - abs: `.stan/context/abs/<sha256hex(abs)>/<basename>`
- Inflate compact meta to a `DependencyGraph` when you want to reuse the helper.

If you want, we can provide a tiny “inflateMetaV2ToDependencyGraph(metaV2)” helper in stan-context later, but for now the host can do it trivially and keep stan-context independent of `.stan/` layout choices.
