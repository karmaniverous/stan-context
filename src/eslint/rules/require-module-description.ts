/**
 * Requirements addressed:
 * - Export an ESLint rule that warns when a TS/JS module has neither a usable
 *   `@module` nor `@packageDocumentation` doc tag (configurable).
 * - "Usable" is defined by the same prose extraction rules used by
 *   GraphNode.description (prose-only; cleanup; single-line; truncation).
 * - Warn by default (consumer-configured); produce a clear message that
 *   reflects the configured tag set and distinguishes missing vs empty prose.
 */

import {
  getBestProseForTag,
  type NodeDescriptionTag,
} from '../../stan-context/providers/ts/describe';

type Options = Array<{
  tags?: NodeDescriptionTag[];
}>;

const DEFAULT_TAGS: NodeDescriptionTag[] = ['module', 'packageDocumentation'];

const formatTagList = (tags: NodeDescriptionTag[]): string => {
  const rendered = tags.map((t) => `@${t}`);
  if (rendered.length === 1) return rendered[0];
  return `${rendered.slice(0, -1).join(', ')} or ${rendered.at(-1)}`;
};

const normalizeTags = (
  tags: NodeDescriptionTag[] | undefined,
): NodeDescriptionTag[] => {
  const inTags = (tags && tags.length ? tags : DEFAULT_TAGS).filter(Boolean);
  // Ensure stable ordering for messaging.
  const order: NodeDescriptionTag[] = ['module', 'packageDocumentation'];
  return order.filter((t) => inTags.includes(t));
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

export const requireModuleDescriptionRule = {
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
  create(context: {
    options: Options;
    getSourceCode: () => { text: string };
    report: (args: { loc?: unknown; message: string }) => void;
  }) {
    const opt = context.options?.[0];
    const tags = normalizeTags(opt?.tags);
    const wanted = formatTagList(tags);

    return {
      Program() {
        const sourceText = context.getSourceCode().text;
        const { usable, results } = hasUsableDocForAnyTag(sourceText, tags);
        if (usable) return;

        const presentButEmpty = results
          .filter((r) => r.present && !r.usable)
          .map((r) => `@${r.tag}`);

        const missing = results
          .filter((r) => !r.present)
          .map((r) => `@${r.tag}`);

        const parts: string[] = [];
        parts.push(
          `Missing usable module documentation: add a /** ... */ doc comment containing ${wanted} with prose.`,
        );

        if (presentButEmpty.length) {
          parts.push(
            `Tag(s) present but prose is empty after cleanup: ${presentButEmpty.join(', ')}.`,
          );
        }
        if (missing.length) {
          parts.push(`Tag(s) missing: ${missing.join(', ')}.`);
        }

        context.report({ message: parts.join(' ') });
      },
    };
  },
} as const;
