---
title: Contributing — Dev Quickstart
---

# Contributing — Dev Quickstart

Thanks for helping improve `@karmaniverous/stan-context`! This project follows a services‑first, test‑first philosophy. Here’s how to get started locally.

## Setup
Prereqs:
- Node ≥ 20
- Git

Clone and install:
```bash
git clone https://github.com/karmaniverous/stan-context.git
cd stan-context
npm i
```

## Common tasks

Run the full test and validation suite:
```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run docs
npm run knip
```

## Coding standards

- Single‑Responsibility modules; prefer small, testable units.
- Plain unified diffs for patches.
- Keep `.stan/system/stan.todo.md` updated with each change set and include a commit message (fenced) in chat replies.

## Submitting changes

1. Create a feature branch: `git checkout -b feature/your-change`
2. Ensure all CI tasks (`lint`, `typecheck`, `test`, `build`, `docs`) pass locally.
3. Open a Pull Request with a clear description and links to any related issues.
4. Expect a review focusing on tests, documentation updates, and module design. Adherence to the project's design principles is key.

## Questions?
Open a GitHub issue with details or propose a design sketch in the PR description.
