> Engine for STAN — programmatic archiving/diffing, patch application, config loading, file selection, and imports staging. No CLI/TTY concerns.

# @karmaniverous/stan-core (engine)

[![npm version](https://img.shields.io/npm/v/@karmaniverous/stan-core.svg)](https://www.npmjs.com/package/@karmaniverous/stan-core) ![Node Current](https://img.shields.io/node/v/@karmaniverous/stan-core) <!-- TYPEDOC_EXCLUDE --> [![docs](https://img.shields.io/badge/docs-website-blue)](https://docs.karmanivero.us/stan-core) [![changelog](https://img.shields.io/badge/changelog-latest-blue.svg)](https://github.com/karmaniverous/stan-core/tree/main/CHANGELOG.md)<!-- /TYPEDOC_EXCLUDE --> [![license](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](https://github.com/karmaniverous/stan-core/tree/main/LICENSE.md)

This package exposes the STAN engine as a library:

- File selection (gitignore + includes/excludes + reserved workspace rules)
- Archiving: full archive.tar and diff archive.diff.tar (binary screening)
- Patch engine: worktree‑first git apply cascade with jsdiff fallback
- File Ops: safe mv/rm/rmdir/mkdirp block as “pre‑ops”
- Config loading/validation (top‑level `stan-core` in stan.config.yml|json)
- Imports staging under <stanPath>/imports/<label>/…
- Response‑format validator (optional)

For the CLI and TTY runner, see @karmaniverous/stan-cli.

## Install

```bash
pnpm add @karmaniverous/stan-core
# or npm i @karmaniverous/stan-core
```

Node: >= 20

## Quick examples

Create a full archive (binary‑safe) and a diff archive:

```ts
import { createArchive } from '@karmaniverous/stan-core/stan';
import { createArchiveDiff } from '@karmaniverous/stan-core/stan/diff';

const cwd = process.cwd();
const stanPath = '.stan';

// Full archive (excludes <stanPath>/diff and binaries; include outputs with { includeOutputDir: true })
const fullTar = await createArchive(cwd, stanPath, { includeOutputDir: false });

// Diff archive (changes vs snapshot under <stanPath>/diff)
const { diffPath } = await createArchiveDiff({
  cwd,
  stanPath,
  baseName: 'archive',
  includeOutputDirInDiff: false,
  updateSnapshot: 'createIfMissing',
});
```

Apply a unified diff (with safe fallback) and/or run File Ops:

```ts
import {
  applyPatchPipeline,
  detectAndCleanPatch,
  executeFileOps,
  parseFileOpsBlock,
} from '@karmaniverous/stan-core/stan/patch';

const cwd = process.cwd();

// File Ops (pre‑ops) example
const plan = parseFileOpsBlock(
  [
    '### File Ops',
    'mkdirp src/new/dir',
    'mv src/old.txt src/new/dir/new.txt',
  ].join('\n'),
);
if (plan.errors.length) throw new Error(plan.errors.join('\n'));
await executeFileOps(cwd, plan.ops, false);

// Unified diff example (from a string)
const cleaned = detectAndCleanPatch(`
diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1,1 +1,1 @@
-old
+new
`);
const out = await applyPatchPipeline({
  cwd,
  patchAbs: '/dev/null', // absolute path to a saved .patch file (not required for js fallback)
  cleaned,
  check: false, // true => sandbox write
});
if (!out.ok) {
  // Inspect out.result.captures (git attempts) and out.js?.failed (jsdiff reasons)
}
```

Load and validate repo config (namespaced `stan-core` in stan.config.yml|json):

YAML example:

```yaml
stan-core:
  stanPath: .stan
  includes: []
  excludes:
    - CHANGELOG.md
  imports:
    cli-docs:
      - ../stan-cli/.stan/system/stan.requirements.md
      - ../stan-cli/.stan/system/stan.todo.md
```

TypeScript:

```ts
import { loadConfig } from '@karmaniverous/stan-core/stan/config';

const cfg = await loadConfig(process.cwd());
// cfg has the minimal engine shape:
// {
//   stanPath: string; includes?: string[]; excludes?: string[];
//   imports?: Record<string, string[]>
// }
```

Stage external imports under <stanPath>/imports/<label>/… before archiving:

```ts
import { prepareImports } from '@karmaniverous/stan-core/stan';
await prepareImports({
  cwd: process.cwd(),
  stanPath: '.stan',
  map: {
    '@scope/docs': ['external/docs/**/*.md'],
  },
});
```

Validate assistant responses (optional utility):

```ts
import { validateResponseMessage } from '@karmaniverous/stan-core/stan';
const res = validateResponseMessage(replyBody);
if (!res.ok) console.error(res.errors.join('\n'));
```

## API surface

Top‑level (via `import '@karmaniverous/stan-core/stan'`):

- Archiving/diff/snapshot: `createArchive`, `createArchiveDiff`, `writeArchiveSnapshot`
- Selection/FS: `listFiles`, `filterFiles`
- Patch engine: `applyPatchPipeline`, `detectAndCleanPatch`, `executeFileOps`, `parseFileOpsBlock`
- Imports: `prepareImports`
- Config: `loadConfig`, `loadConfigSync`, `resolveStanPath`, `resolveStanPathSync`
- Validation: `validateResponseMessage`

See CHANGELOG for behavior changes. Typedoc site is generated from source.

## Selection precedence and anchors

Core file selection applies in this order:

- Reserved denials always win and cannot be overridden:
  - `.git/**`, `<stanPath>/diff/**`, `<stanPath>/patch/**`,
  - archive outputs under `<stanPath>/output/…`,
  - binary screening during archive classification.
- `includes` override `.gitignore` (but not `excludes`).
- `excludes` override `includes`.
- `anchors` (optional) re‑include paths after excludes and `.gitignore`, subject to reserved denials and binary screening.

APIs that accept anchors:

- `filterFiles(files, { …, anchors?: string[] })`
- `createArchive(cwd, stanPath, { …, anchors?: string[] })`
- `createArchiveDiff({ …, anchors?: string[] })`
- `writeArchiveSnapshot({ …, anchors?: string[] })`

## Environment variables

See [Env Vars](./guides/env-vars.md) for a complete list of environment variable switches observed by the engine, tests, and release scripts.

## Migration (legacy configs)

This engine expects a top‑level, namespaced `stan-core` block in `stan.config.yml|json`. If your repository still uses legacy, flat keys at the root, migrate with the CLI:

```bash
stan init  # offers to refactor legacy → namespaced; supports --dry-run and backups
```

## License

BSD‑3‑Clause
