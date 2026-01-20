/**
 * Requirements addressed:
 * - TS/JS provider derives GraphNode.description from the prose portion of a
 *   doc comment containing `@module` (or `@packageDocumentation`).
 * - Never use the module tag itself as the description (prose only; omit when
 *   prose is empty).
 * - Normalize to a single line and truncate to `nodeDescriptionLimit` with
 *   ASCII `...`.
 * - Prefer whichever yields higher entropy after cleanup + truncation; tie
 *   breaks in favor of `@module`.
 */

const docBlockRe = /\/\*\*[\s\S]*?\*\//g;

const hasTag = (block: string, tag: string): boolean =>
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

const extractProseFromTaggedBlock = (
  block: string,
  nodeDescriptionLimit: number,
): string | undefined => {
  const limit = nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) return undefined;

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

  if (normalized.length <= limit) return normalized;
  if (limit < 4) return undefined;

  const head = normalized.slice(0, limit - 3).trimEnd();
  return `${head}...`;
};

export const describeTsJsModule = (args: {
  sourceText: string;
  nodeDescriptionLimit: number;
}): string | undefined => {
  const limit = args.nodeDescriptionLimit;
  if (!Number.isFinite(limit) || limit <= 0) return undefined;

  let moduleBlock: string | undefined;
  let pkgDocBlock: string | undefined;

  for (const match of args.sourceText.matchAll(docBlockRe)) {
    const block = match[0];
    if (!moduleBlock && hasTag(block, 'module')) moduleBlock = block;
    if (!pkgDocBlock && hasTag(block, 'packageDocumentation'))
      pkgDocBlock = block;
    if (moduleBlock && pkgDocBlock) break;
  }

  const moduleDesc =
    moduleBlock && extractProseFromTaggedBlock(moduleBlock, limit);
  const pkgDesc =
    pkgDocBlock && extractProseFromTaggedBlock(pkgDocBlock, limit);

  if (!moduleDesc && !pkgDesc) return undefined;
  if (moduleDesc && !pkgDesc) return moduleDesc;
  if (!moduleDesc && pkgDesc) return pkgDesc;

  // Prefer whichever yields more entropy after cleanup + truncation.
  if ((pkgDesc as string).length > (moduleDesc as string).length)
    return pkgDesc as string;

  // Tie-break to @module.
  return moduleDesc as string;
};
