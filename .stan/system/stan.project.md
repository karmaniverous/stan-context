# stan.project.md (stan-context)

This file is the project-specific prompt for `@karmaniverous/stan-context`. It augments the repo-agnostic rules in `.stan/system/stan.system.md`.

Requirements belong in `.stan/system/stan.requirements.md`. Work tracking belongs in `.stan/system/stan.todo.md`.

## Scope guardrails (do not re-introduce template concerns)

- `stan-context` is an analysis-only “context compiler”.
  - Do not add archiving/diff/snapshot/patch application behavior here (that belongs to `stan-core` / `stan-cli`).
  - Avoid importing `stan-core` to “reuse” selection logic; `stan-context` must remain independent.
- Keep the public contract small and deterministic:
  - Avoid “debug convenience” fields in the graph schema (e.g., storing raw import specifiers on edges) unless we explicitly decide the payload cost is worth it.

## Dynamic import policy

- Avoid dynamic imports (`import()`) unless there is a compelling argument.
- Allowed exception (compelling):
  - Optional peer dependency loading (e.g., TypeScript). Prefer `createRequire` + `require()` with a small, isolated loader module and clear comments.

## Testing defaults

- Default Vitest environment is `node`.
  - Do not add DOM environments (happy-dom/jsdom) unless a specific module requires it.

## Implementation watch-outs (moved from dev plan)

- Performance
  - Creating a TypeScript `Program` over the full Universe may be expensive for large repos.
  - Prefer designs where `Program` creation is stable and per-file work is limited to `dirty` files (and required reverse-dependency invalidation).
- Module systems and edge classification
  - Edge kind classification is best-effort (especially `dynamic` vs `runtime` in mixed ESM/CJS).
  - Keep the rules simple, consistent, and covered by tests rather than chasing perfection.
- External resolution fidelity
  - Represent pnpm store paths and symlinked dependency paths faithfully (physical truth).
  - When a resolved physical path is outside `cwd`, normalize to POSIX separators and mark `metadata.isOutsideRoot: true`.

## TSDoc comment escaping

- We prefer clear, expressive TSDoc comments (including operators like `=>`).
- Escape special characters to avoid TSDoc parser warnings:
  - Use `=\>` when writing `=>` in a doc comment.
  - Escape literal object braces as `\{` and `\}` when writing shapes inline (to avoid “inline tag” parsing).
  - If a literal Windows path is needed, prefer `C:\\x` rather than `C:\x` in comments.

## Documentation hygiene reminder

- If we change behavior that affects how `stan-core` consumes the graph, update `.stan/system/stan.requirements.md` in the same change set.
- Keep the dev plan actionable; avoid long-term “pitfalls” sections in `.stan/system/stan.todo.md` (those belong here).
