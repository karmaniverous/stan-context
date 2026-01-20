/**
 * Requirements addressed:
 * - Shared docblock extraction MUST ignore comment-shaped sequences inside
 *   string literals and template literals.
 * - Used by both TS/JS description extraction and the eslint rule to avoid
 *   false positives (e.g., `/** @module *\/` inside a string).
 *
 * Notes:
 * - This is a lightweight scanner; it does not require a TypeScript Program.
 * - It intentionally focuses on reliably skipping strings/templates and
 *   returning real `/** ... *\/` docblocks.
 */

type Mode =
  | { kind: 'code' }
  | { kind: 'single' }
  | { kind: 'double' }
  | { kind: 'template' }
  | { kind: 'templateExpr'; braceDepth: number };

const isEol = (ch: string): boolean => ch === '\n' || ch === '\r';

const skipLineComment = (s: string, i: number): number => {
  let j = i;
  while (j < s.length && !isEol(s[j])) j++;
  return j;
};

const findBlockCommentEnd = (s: string, i: number): number | null => {
  // i is the index of the first char after "/*" or "/**".
  for (let j = i; j < s.length - 1; j++) {
    if (s[j] === '*' && s[j + 1] === '/') return j + 2;
  }
  return null;
};

/**
 * Extract all real `/** ... *\/` docblocks from source text, skipping:
 * - strings ('...', "..."),
 * - template literals (`...`),
 * - regular block comments (/* ... *\/),
 * - and line comments (// ...).
 */
export const scanDocBlocks = (sourceText: string): string[] => {
  const out: string[] = [];
  const stack: Mode[] = [{ kind: 'code' }];

  const top = (): Mode => stack[stack.length - 1];
  const push = (m: Mode) => stack.push(m);
  const pop = () => {
    if (stack.length > 1) stack.pop();
  };

  for (let i = 0; i < sourceText.length; i++) {
    const m = top();
    const ch = sourceText[i];
    const next = sourceText[i + 1] as string | undefined;

    // --- String modes (skip escapes, pop on closing delimiter) ---
    if (m.kind === 'single') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === "'") {
        pop();
      }
      continue;
    }

    if (m.kind === 'double') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '"') {
        pop();
      }
      continue;
    }

    if (m.kind === 'template') {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === '`') {
        pop();
        continue;
      }
      if (ch === '$' && next === '{') {
        push({ kind: 'templateExpr', braceDepth: 1 });
        i++; // consume "{"
        continue;
      }
      continue;
    }

    // --- Template expression code (like code mode, but with brace tracking) ---
    if (m.kind === 'templateExpr') {
      if (ch === "'") {
        push({ kind: 'single' });
        continue;
      }
      if (ch === '"') {
        push({ kind: 'double' });
        continue;
      }
      if (ch === '`') {
        push({ kind: 'template' });
        continue;
      }

      if (ch === '/' && next === '/') {
        i = skipLineComment(sourceText, i + 2) - 1;
        continue;
      }
      if (ch === '/' && next === '*') {
        const isDoc = sourceText[i + 2] === '*';
        const end = findBlockCommentEnd(sourceText, i + 2);
        if (end === null) return out;
        if (isDoc) out.push(sourceText.slice(i, end));
        i = end - 1;
        continue;
      }

      if (ch === '{') {
        m.braceDepth++;
        continue;
      }
      if (ch === '}') {
        m.braceDepth--;
        if (m.braceDepth <= 0) pop();
        continue;
      }

      continue;
    }

    // --- Code mode (only remaining case) ---
    if (ch === "'") {
      push({ kind: 'single' });
      continue;
    }
    if (ch === '"') {
      push({ kind: 'double' });
      continue;
    }
    if (ch === '`') {
      push({ kind: 'template' });
      continue;
    }

    // Line comment
    if (ch === '/' && next === '/') {
      i = skipLineComment(sourceText, i + 2) - 1;
      continue;
    }

    // Block comment: capture only docblocks "/**"
    if (ch === '/' && next === '*') {
      const isDoc = sourceText[i + 2] === '*';
      const end = findBlockCommentEnd(sourceText, i + 2);
      if (end === null) return out;
      if (isDoc) out.push(sourceText.slice(i, end));
      i = end - 1;
      continue;
    }
  }

  return out;
};
