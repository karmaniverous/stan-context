import { requireModuleDescriptionRule } from './require-module-description';

const run = (args: {
  sourceText: string;
  options?: Array<{ tags?: string[] }>;
}): string[] => {
  const messages: string[] = [];

  const sourceCode = {
    text: args.sourceText,
    ast: { type: 'Program', body: [] },
    getAllComments: () => [],
    getFirstToken: () => ({
      loc: {
        start: { line: 1, column: 0 },
        end: { line: 1, column: 1 },
      },
    }),
  };

  const ctx = {
    options: args.options ?? [],
    sourceCode,
    report: ({ message }: { node: unknown; message: string }) =>
      messages.push(message),
  } as unknown as Parameters<typeof requireModuleDescriptionRule.create>[0];

  const listeners = requireModuleDescriptionRule.create(ctx) as {
    Program?: (node: unknown) => void;
  };

  listeners.Program?.({ type: 'Program' });
  return messages;
};

describe('eslint rule: require-module-description', () => {
  test('warns when neither tag is present', () => {
    const msgs = run({
      sourceText: `export const x = 1;\n`,
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('@module');
    expect(msgs[0]).toContain('@packageDocumentation');
    expect(msgs[0]).toContain('either');
    expect(msgs[0]).not.toContain('Tag(s) missing');
  });

  test('warns when tag is present but prose is empty', () => {
    const msgs = run({
      sourceText: `/** @module */\nexport const x = 1;\n`,
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('@module');
    expect(msgs[0]).toContain('prose is empty');
  });

  test('does not warn when @module prose is present', () => {
    const msgs = run({
      sourceText: `/**\n * @module\n * Some prose.\n */\nexport const x = 1;\n`,
    });
    expect(msgs).toEqual([]);
  });

  test('does not treat docblocks inside strings as real docs', () => {
    const msgs = run({
      sourceText: 'const s = `/** @module */`;\nexport const x = 1;\nvoid s;\n',
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('@module');
    expect(msgs[0]).toContain('@packageDocumentation');
    expect(msgs[0]).not.toContain('Found @module but prose is empty');
  });

  test('respects tags option (module-only)', () => {
    const msgs = run({
      sourceText: `/**\n * @packageDocumentation\n * Some prose.\n */\nexport const x = 1;\n`,
      options: [{ tags: ['@module'] }],
    });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toContain('@module');
    expect(msgs[0]).not.toContain('@packageDocumentation');
  });
});
