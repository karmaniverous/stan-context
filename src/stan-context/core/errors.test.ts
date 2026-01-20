import { capErrors } from './errors';

describe('capErrors', () => {
  test('returns [] when maxErrors is 0', () => {
    expect(capErrors(['a', 'b'], 0)).toEqual([]);
  });

  test('returns all errors when <= maxErrors', () => {
    expect(capErrors(['a', 'b'], 2)).toEqual(['a', 'b']);
  });

  test('when maxErrors is 1, returns only a sentinel', () => {
    expect(capErrors(['a', 'b', 'c'], 1)).toEqual([
      'errors truncated: 3 total',
    ]);
  });

  test('truncates to maxErrors entries including sentinel', () => {
    const out = capErrors(['a', 'b', 'c', 'd'], 3);
    expect(out).toEqual(['a', 'b', 'errors truncated: showing 2 of 4']);
  });
});
