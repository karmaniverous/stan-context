import { describeTsJsModule } from './describe';

describe('describeTsJsModule', () => {
  test('extracts prose only (never uses @module tag text)', () => {
    const sourceText = `
/**
 * @module SomeName
 * This is the module summary.
 */
export const x = 1;
`;

    expect(describeTsJsModule({ sourceText, nodeDescriptionLimit: 160 })).toBe(
      'This is the module summary.',
    );
  });

  test('omits description when prose is empty', () => {
    const sourceText = `
/** @module */
export const x = 1;
`;
    expect(describeTsJsModule({ sourceText, nodeDescriptionLimit: 160 })).toBe(
      undefined,
    );
  });

  test('cleans common inline markup and truncates with "..."', () => {
    const sourceText = `
/**
 * @module
 * Use {@link Foo | FooType} and \`bar()\` plus [docs](https://example.com).
 */
export const x = 1;
`;
    const out = describeTsJsModule({ sourceText, nodeDescriptionLimit: 24 });
    expect(out).toBe('Use FooType and bar() pl...');
  });

  test('prefers higher-entropy result after truncation; tie -> @module', () => {
    const sourceText = `
/**
 * @module
 * Short module desc.
 */
/**
 * @packageDocumentation
 * This is a longer package documentation description.
 */
export {};
`;

    // Large enough that the longer one remains longer.
    expect(describeTsJsModule({ sourceText, nodeDescriptionLimit: 200 })).toBe(
      'This is a longer package documentation description.',
    );

    // Small enough that both truncate to same length; tie-break to @module.
    expect(describeTsJsModule({ sourceText, nodeDescriptionLimit: 10 })).toBe(
      'Short modu...',
    );
  });

  test('uses best-entropy docblock when multiple candidates exist', () => {
    const sourceText = `
/**
 * @module
 */
/**
 * @module
 * Longer description wins over earlier empty tag.
 */
export const x = 1;
`;

    expect(describeTsJsModule({ sourceText, nodeDescriptionLimit: 160 })).toBe(
      'Longer description wins over earlier empty tag.',
    );
  });

  test('ignores docblock-shaped sequences inside strings', () => {
    const sourceText = `
const s = \`/** @module */\`;
export const x = 1;
void s;
`;
    expect(describeTsJsModule({ sourceText, nodeDescriptionLimit: 160 })).toBe(
      undefined,
    );
  });

  test('supports arbitrary @tags when configured', () => {
    const sourceText = `
/**
 * @foo
 * Foo description.
 */
export const x = 1;
`;
    expect(
      describeTsJsModule({
        sourceText,
        nodeDescriptionLimit: 160,
        tags: ['@foo'],
      }),
    ).toBe('Foo description.');
  });
});
