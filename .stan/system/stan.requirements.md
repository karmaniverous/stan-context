# STAN — Requirements (stan-context)

This document defines the requirements for `@karmaniverous/stan-context`, a pure analysis provider that generates dependency graphs and structural metadata for STAN. It is consumed by `stan-core`.

---

## 1) Purpose and Scope

Provide a language-aware dependency analysis engine.
- **Input**: Repository root path.
- **Output**: A deterministic Dependency Graph (nodes/edges) and Context Metadata (sizes/hashes).
- **Goal**: Enable "Context Selection" (AI chooses what to read based on the map) rather than "Context Filtering".

## 2) Graph Schema (The Map)

The graph must be a serializable JSON object.

### Nodes (Modules)
Represent a single file.
- **id**: Repo-relative path (POSIX).
- **type**:
  - `'source'`: Local source file.
  - `'external'`: Resolved `node_modules` target (e.g., `node_modules/pkg/index.d.ts`).
- **metadata**:
  - `size`: File size in bytes (Critical for AI decision making).
  - `hash`: SHA-256 content hash.

### Edges (Dependencies)
Directional relationship (`Source -> Target`).
- **kind**:
  - `'runtime'`: Standard import/require.
  - `'type'`: Type-only import or JSDoc reference.
  - `'dynamic'`: Async `import()` or `require()`.
- **resolution**:
  - `'explicit'`: Direct file-to-file.
  - `'implicit'`: Tunneled through a barrel/index.

## 3) Analysis Logic (TypeScript Provider)

- **Engine**: Use the TypeScript Compiler API (not a bundler) to ensure source-truth fidelity.
- **Scope**: Handle `.ts`, `.tsx`, `.js`, `.jsx`, `.d.ts`.
- **Barrel Tunneling**:
  - Detect imports from barrel files (`index.ts`).
  - Resolve the "Physical" target (the actual implementation file) to allow granular selection.
- **External Resolution**:
  - **Shallow**: Resolve imports into `node_modules` only to the entry point file (usually `.d.ts` or `.js`). Do NOT analyze the internal graph of external packages.
  - **Granularity**: File-level.

## 4) Incrementalism

- The provider must accept a "Previous Graph" and a set of "Changed Files".
- Re-analyze only changed files and their dependents.
- Return the cached graph if no material changes occurred.

## 5) Artifacts

- **Core Graph**: Compact, committed to git (for PR reviews).
- **Context Meta**: A generated schema for `.stan/system/context.meta.json` (the selection state file), though `stan-core` manages the I/O.
