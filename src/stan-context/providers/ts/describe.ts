/**
 * Requirements addressed:
 * - TS/JS provider derives GraphNode.description from the prose portion of a
 *   doc comment containing `@module` and/or `@packageDocumentation`.
 * - Never use the module tag itself as the description (prose only; omit when
 *   prose is empty).
 * - Normalize to a single line and truncate to a prefix of `nodeDescriptionLimit`
 *   characters, then append ASCII `...` (ellipsis is not counted in the prefix).
 * - When multiple candidates exist, prefer higher-entropy prose:
 *   choose the longest cleaned prose; tie breaks in favor of `@module`.
 */

const docBlockRe = /\/\*\*[\s\S]*?\*\//g;

export type NodeDescriptionTag = 'module' | 'packageDocumentation';
export const DEFAULT_NODE_DESCRIPTION_TAGS: NodeDescriptionTag[] = [
  'module',
  'packageDocumentation',
];

const hasTag = (block: string, tag: NodeDescriptionTag): boolean =>
  new RegExp(`@${tag}\\b`).test(block);

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
  | { tag: NodeDescriptionTag; present: false; usable: false }
  | { tag: NodeDescriptionTag; present: true; usable: false }
  | {
      tag: NodeDescriptionTag;
      present: true;
      usable: true;
      description: string;
    };

export const getBestProseForTag = (args: {
  sourceText: string;
  tag: NodeDescriptionTag;
  nodeDescriptionLimit: number;
}): TagProseStatus => {
  const limit = args.nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) {
    return { tag: args.tag, present: false, usable: false };
  }

  let present = false;
  let best: { prose: string; len: number } | null = null;

  for (const match of args.sourceText.matchAll(docBlockRe)) {
    const block = match[0];
    if (!hasTag(block, args.tag)) continue;
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
  tags?: NodeDescriptionTag[];
}): string | undefined => {
  const limit = args.nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) return undefined;

  const tags = (args.tags ?? DEFAULT_NODE_DESCRIPTION_TAGS).filter(Boolean);
  const considerModule = tags.includes('module');
  const considerPkg = tags.includes('packageDocumentation');

  const moduleStatus = considerModule
    ? getBestProseForTag({
        sourceText: args.sourceText,
        tag: 'module',
        nodeDescriptionLimit: limit,
      })
    : null;

  const pkgStatus = considerPkg
    ? getBestProseForTag({
        sourceText: args.sourceText,
        tag: 'packageDocumentation',
        nodeDescriptionLimit: limit,
      })
    : null;

  const moduleDesc =
    moduleStatus && moduleStatus.present && moduleStatus.usable
      ? moduleStatus.description
      : undefined;

  const pkgDesc =
    pkgStatus && pkgStatus.present && pkgStatus.usable
      ? pkgStatus.description
      : undefined;

  if (!moduleDesc && !pkgDesc) return undefined;
  if (moduleDesc && !pkgDesc) return moduleDesc;
  if (!moduleDesc && pkgDesc) return pkgDesc;

  // Both exist. Prefer higher-entropy prose. With truncation configured as
  // "prefix N + ...", compare by resulting string length and tie-break to @module.
  if ((pkgDesc as string).length > (moduleDesc as string).length)
    return pkgDesc as string;
  return moduleDesc as string;
};
