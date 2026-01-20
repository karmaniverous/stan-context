/**
 * Requirements addressed:
 * - Runtime setting `maxErrors` limits the size of GraphResult.errors to avoid
 *   runaway outputs on pathological repositories.
 */

export const capErrors = (errors: string[], maxErrors: number): string[] => {
  if (!Number.isFinite(maxErrors)) return errors;

  const max = Math.max(0, Math.floor(maxErrors));
  if (max === 0) return [];
  if (errors.length <= max) return errors;

  if (max === 1) return [`errors truncated: ${String(errors.length)} total`];

  const shown = max - 1;
  return [
    ...errors.slice(0, shown),
    `errors truncated: showing ${String(shown)} of ${String(errors.length)}`,
  ];
};
