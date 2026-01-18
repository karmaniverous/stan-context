/**
 * Requirements addressed:
 * - TypeScript is a peer dependency with graceful degradation when missing.
 */

export const loadTypeScript = async (): Promise<
  typeof import('typescript')
> => {
  // Dynamic import so the package can run without TypeScript installed.
  return (await import('typescript')) as typeof import('typescript');
};
