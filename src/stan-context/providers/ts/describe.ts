/**
 * Requirements addressed:
 * - TS/JS provider derives GraphNode.description from the prose portion of a
 *   doc comment containing one or more configured TSDoc tags (e.g., `@module`).
 * - Never use the module tag itself as the description (prose only; omit when
 *   prose is empty).
 * - Normalize to a single line and truncate to a prefix of `nodeDescriptionLimit`
 *   characters, then append ASCII `...` (ellipsis is not counted in the prefix).
 * - When multiple candidates exist, prefer higher-entropy prose:
 *   choose the longest cleaned prose; tie breaks by configured tag order.
 * - Docblocks MUST ignore comment-shaped sequences inside strings/templates.
 */

import { scanDocBlocks } from './docblocks';

export const DEFAULT_NODE_DESCRIPTION_TAGS: string[] = [
  '@module',
  '@packageDocumentation',
];
const TAG_TOKEN_RE = /^@\w+$/;

export const normalizeDocTags = (tags?: string[]): string[] => {
  const input = Array.isArray(tags) ? tags : [];
  const filtered = input.filter((t): t is string => typeof t === 'string');
  const normalized = filtered
    .map((t) => t.trim())
    .filter((t) => TAG_TOKEN_RE.test(t));

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const t of normalized) {
    if (seen.has(t)) continue;
    seen.add(t);
    deduped.push(t);
  }

  return deduped.length ? deduped : [...DEFAULT_NODE_DESCRIPTION_TAGS];
};

const stripBlockCommentSyntax = (block: string): string[] => {
  const body = block
    .replace(/^\s*\/\*\*/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/\r\n?/g, '\n');

  return body
    .split('\n')
    .map((l) => l.replace(/^\s*\*\s?/, ''))
    .map((l) => l.trim());
};

const cleanupInlineMarkup = (text: string): string => {
  // TSDoc link tags: prefer label when present.
  const linkTagRe =
    /\{@(?:link|linkcode|linkplain)\s+([^}|]+)(?:\s*\|\s*([^}]+))?\}/g;
  let out = text.replace(linkTagRe, (_m, target: string, label?: string) => {
    const chosen = (label ?? target).trim();
    return chosen;
  });

  // Strip remaining inline tags (best-effort).
  out = out.replace(/\{@\w+[^}]*\}/g, '');

  // Markdown links: [label](url) -> label
  out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Inline code: `code` -> code
  out = out.replace(/`([^`]*)`/g, '$1');

  return out;
};

const extractNormalizedProseFromTaggedBlock = (
  block: string,
): string | undefined => {
  const lines = stripBlockCommentSyntax(block);

  // Prose is anything not on a tag line.
  const proseLines = lines.filter((l) => {
    const t = l.trim();
    if (!t) return false;
    return !t.startsWith('@');
  });

  if (!proseLines.length) return undefined;

  const cleaned = cleanupInlineMarkup(proseLines.join(' '));
  const normalized = cleaned.replace(/\s+/g, ' ').trim();
  if (!normalized) return undefined;

  return normalized;
};

const truncateWithEllipsis = (text: string, prefixLimit: number): string => {
  const limit = prefixLimit;
  if (!Number.isFinite(limit) || limit <= 0) return '';

  if (text.length <= limit) return text;

  const head = text.slice(0, limit).trimEnd();
  return `${head}...`;
};

export type TagProseStatus =
  | { tag: string; present: false; usable: false }
  | { tag: string; present: true; usable: false }
  | {
      tag: string;
      present: true;
      usable: true;
      description: string;
    };

export const getBestProseForTag = (args: {
  sourceText: string;
  tag: string;
  nodeDescriptionLimit: number;
}): TagProseStatus => {
  const limit = args.nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { tag: args.tag, present: false, usable: false };
  }

  const tag = args.tag.trim();
  if (!TAG_TOKEN_RE.test(tag))
    return { tag: args.tag, present: false, usable: false };

  let present = false;
  let best: { prose: string; len: number } | null = null;

  for (const block of scanDocBlocks(args.sourceText)) {
    const lines = stripBlockCommentSyntax(block);
    const tagTokens = new Set<string>();
    for (const l of lines) {
      const m = l.match(/^@\w+/);
      if (m && TAG_TOKEN_RE.test(m[0])) tagTokens.add(m[0]);
    }

    if (!tagTokens.has(tag)) continue;
    present = true;

    const prose = extractNormalizedProseFromTaggedBlock(block);
    if (!prose) continue;

    const len = prose.length;
    if (!best || len > best.len) best = { prose, len };
  }

  if (!present) return { tag: args.tag, present: false, usable: false };
  if (!best) return { tag: args.tag, present: true, usable: false };

  const description = truncateWithEllipsis(best.prose, limit);
  if (!description) return { tag: args.tag, present: true, usable: false };

  return { tag: args.tag, present: true, usable: true, description };
};

export const describeTsJsModule = (args: {
  sourceText: string;
  nodeDescriptionLimit: number;
  tags?: string[];
}): string | undefined => {
  const limit = args.nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) return undefined;

  const tags = normalizeDocTags(args.tags);

  let best: { tag: string; description: string } | null = null;
  for (const tag of tags) {
    const st = getBestProseForTag({
      sourceText: args.sourceText,
      tag,
      nodeDescriptionLimit: limit,
    });
    if (!st.present || !st.usable) continue;

    if (!best || st.description.length > best.description.length) {
      best = { tag, description: st.description };
      continue;
    }
    // Tie-break by tag order: first wins (keep existing best).
  }

  return best?.description;
};
