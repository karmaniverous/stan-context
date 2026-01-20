/**
 * Requirements addressed:
 * - Export an ESLint rule that warns when a TS/JS module has neither a usable
 *   `@module` nor `@packageDocumentation` doc tag (configurable).
 * - "Usable" is defined by the same prose extraction rules used by
 *   GraphNode.description (prose-only; cleanup; single-line; truncation).
 * - Warn by default (consumer-configured); produce a clear message that
 *   reflects the configured tag set and distinguishes missing vs empty prose.
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
  type NodeDescriptionTag,
} from '../../stan-context/providers/ts/describe';

type Options = Array<{
  tags?: NodeDescriptionTag[];
}>;

const DEFAULT_TAGS: NodeDescriptionTag[] = ['module', 'packageDocumentation'];

const normalizeTags = (
  tags: NodeDescriptionTag[] | undefined,
): NodeDescriptionTag[] => {
  const inTags = (tags && tags.length ? tags : DEFAULT_TAGS).filter(Boolean);
  // Ensure stable ordering for messaging.
  const order: NodeDescriptionTag[] = ['module', 'packageDocumentation'];
  return order.filter((t) => inTags.includes(t));
};

const formatTagList = (tags: NodeDescriptionTag[]): string => {
  const rendered = tags.map((t) => `@${t}`);
  if (rendered.length === 1) return rendered[0];
  const last = rendered[rendered.length - 1];
  return `either ${rendered.slice(0, -1).join(', ')} or ${last}`;
};

const hasUsableDocForAnyTag = (
  sourceText: string,
  tags: NodeDescriptionTag[],
) => {
  // Use a tiny prefix limit for performance. Under the truncation contract
  // ("prefix N + ..."), any non-empty prose remains non-empty with N=1.
  const limit = 1;
  const results = tags.map((tag) =>
    getBestProseForTag({ sourceText, tag, nodeDescriptionLimit: limit }),
  );
  const usable = results.some((r) => r.present && r.usable);
  return { usable, results };
};

type SourceCodeLike = {
  text: string;
  ast?: { body?: unknown[] };
  getAllComments?: () => Array<{
    type: string;
    value: string;
    loc?: unknown;
  }>;
  getFirstToken?: (n: unknown) => { loc?: unknown } | null;
};

const findFirstDocCommentLocForTag = (
  sourceCode: SourceCodeLike,
  tag: NodeDescriptionTag,
): unknown | undefined => {
  const comments = sourceCode.getAllComments ? sourceCode.getAllComments() : [];
  // For `/** ... */` comments, ESLint exposes `value` without delimiters and it
  // begins with `*`.
  const found = comments.find(
    (c) =>
      c.type === 'Block' &&
      typeof c.value === 'string' &&
      c.value.startsWith('*') &&
      c.value.includes(`@${tag}`),
  );
  return found?.loc;
};

const getFirstTokenLoc = (sourceCode: SourceCodeLike): unknown | undefined => {
  if (!sourceCode.getFirstToken) return undefined;
  const firstNode = sourceCode.ast?.body?.[0] ?? sourceCode.ast;
  const tok = sourceCode.getFirstToken(firstNode ?? {});
  return tok?.loc;
};

export const requireModuleDescriptionRule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Require usable module documentation prose in @module/@packageDocumentation.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          tags: {
            type: 'array',
            items: { enum: ['module', 'packageDocumentation'] },
            minItems: 1,
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const opts = (context.options as Options) ?? [];
    const opt = opts[0];
    const tags = normalizeTags(opt?.tags);
    const wanted = formatTagList(tags);

    return {
      Program(node) {
        const sourceCode = context.getSourceCode() as unknown as SourceCodeLike;
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
          parts.push(`Found @${t} but prose is empty after cleanup.`);
        }

        const message = parts.join(' ');

        // Tight location selection to avoid editor “whole file” highlighting.
        if (presentButEmpty.length) {
          const loc =
            findFirstDocCommentLocForTag(sourceCode, presentButEmpty[0]) ??
            getFirstTokenLoc(sourceCode);
          context.report(
            (loc
              ? { node, loc, message }
              : { node, message }) as unknown as Rule.ReportDescriptor,
          );
          return;
        }

        const loc = getFirstTokenLoc(sourceCode);
        context.report(
          (loc
            ? { node, loc, message }
            : { node, message }) as unknown as Rule.ReportDescriptor,
        );
      },
    };
  },
};
