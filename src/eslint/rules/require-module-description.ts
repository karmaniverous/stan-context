/**
 * Requirements addressed:
 * - Export an ESLint rule that warns when a TS/JS module has neither a usable
 *   doc tag (configurable) nor non-empty prose for that tag after cleanup.
 * - "Usable" is defined by the same prose extraction rules used by
 *   GraphNode.description (prose-only; cleanup; single-line; truncation).
 * - Tag configuration is tag-agnostic:
 *   - Tags are strict `@`-prefixed strings matching `^@\\w+$`.
 *   - Defaults are provided by the shared `normalizeDocTags` helper.
 *
 * UX notes:
 * - Avoid redundant “Tag(s) missing …” messaging when the configured tags are
 *   already listed in the “either/or” clause.
 * - Avoid editor “whole file” highlighting by reporting on a tighter location:
 *   - if a tag exists but is unusable: report on the first matching doc comment
 *   - otherwise: report on the first token (e.g., first import)
 */

import type { Rule } from 'eslint';

import {
  getBestProseForTag,
  normalizeDocTags,
} from '../../stan-context/providers/ts/describe';

type Options = Array<{
  tags?: string[];
}>;

type SourceLocation = {
  start: { line: number; column: number };
  end: { line: number; column: number };
};

type CommentLike = { type: string; value: string; loc: SourceLocation | null };
type TokenLike = { loc: SourceLocation | null };

type SourceCodeLike = {
  text: string;
  ast: { body: unknown[] };
  getAllComments: () => CommentLike[];
  getFirstToken: (node: unknown) => TokenLike | null;
};

const getSourceCode = (context: Rule.RuleContext): SourceCodeLike =>
  (context as unknown as { sourceCode: SourceCodeLike }).sourceCode;

const formatTagList = (tags: string[]): string => {
  if (tags.length === 0) return '@module';
  if (tags.length === 1) return tags[0];
  if (tags.length === 2) return `either ${tags[0]} or ${tags[1]}`;
  return `one of: ${tags.join(', ')}`;
};

const hasUsableDocForAnyTag = (sourceText: string, tags: string[]) => {
  // Use a tiny prefix limit for performance. Under the truncation contract
  // ("prefix N + ..."), any non-empty prose remains non-empty with N=1.
  const limit = 1;
  const results = tags.map((tag) =>
    getBestProseForTag({ sourceText, tag, nodeDescriptionLimit: limit }),
  );
  const usable = results.some((r) => r.present && r.usable);
  return { usable, results };
};

const findFirstDocCommentLocForTag = (
  sourceCode: SourceCodeLike,
  tag: string,
): SourceLocation | undefined => {
  const comments = sourceCode.getAllComments();
  // For `/** ... */` comments, ESLint exposes `value` without delimiters and it
  // begins with `*`.
  const found = comments.find(
    (c) =>
      c.type === 'Block' &&
      typeof c.value === 'string' &&
      c.value.startsWith('*') &&
      c.value.includes(tag),
  );
  const loc = found?.loc ?? null;
  return loc ?? undefined;
};

const getFirstTokenLoc = (
  sourceCode: SourceCodeLike,
): SourceLocation | undefined => {
  const firstNode = sourceCode.ast.body[0] ?? sourceCode.ast;
  const tok = sourceCode.getFirstToken(firstNode);
  const loc = tok?.loc ?? null;
  return loc ?? undefined;
};

export const requireModuleDescriptionRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require usable module documentation prose for configured @tags.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { type: 'string', pattern: '^@\\w+$' },
            minItems: 1,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const opts = context.options as Options;
    const opt = opts.length ? opts[0] : undefined;

    const tags = normalizeDocTags(opt?.tags);
    const wanted = formatTagList(tags);

    return {
      Program(node) {
        const sourceCode = getSourceCode(context);
        const sourceText = sourceCode.text;

        const { usable, results } = hasUsableDocForAnyTag(sourceText, tags);
        if (usable) return;

        const presentButEmpty = results
          .filter((r) => r.present && !r.usable)
          .map((r) => r.tag);

        const parts: string[] = [
          `Missing usable module documentation: add a /** ... */ doc comment containing ${wanted} with prose.`,
        ];

        for (const t of presentButEmpty) {
          parts.push(`Found ${t} but prose is empty after cleanup.`);
        }

        const message = parts.join(' ');

        // Tight location selection to avoid editor “whole file” highlighting.
        if (presentButEmpty.length) {
          const loc =
            findFirstDocCommentLocForTag(sourceCode, presentButEmpty[0]) ??
            getFirstTokenLoc(sourceCode);

          const desc = (loc
            ? { node, loc, message }
            : { node, message }) as unknown as Rule.ReportDescriptor;
          context.report(desc);
          return;
        }

        const loc = getFirstTokenLoc(sourceCode);
        const desc = (loc
          ? { node, loc, message }
          : { node, message }) as unknown as Rule.ReportDescriptor;
        context.report(desc);
      },
    };
  },
};
