import assert from 'node:assert/strict';

interface Expected {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toContain(expected: unknown): void;
  toBeGreaterThanOrEqual(expected: number): void;
  toBeInstanceOf(expected: abstract new (...args: never[]) => unknown): void;
  toThrow(expected?: RegExp | string): void;
  not: {
    toBe(expected: unknown): void;
    toContain(expected: unknown): void;
    toThrow(expected?: RegExp | string): void;
  };
  rejects: {
    toThrow(expected?: RegExp | string): Promise<void>;
  };
}

function errorMatcher(expected?: RegExp | string): RegExp | undefined {
  return typeof expected === 'string' ? new RegExp(expected) : expected;
}

function assertErrorMatches(error: unknown, expected: RegExp | string): void {
  const matcher = errorMatcher(expected)!;
  const text = String(error);
  if (matcher.test(text)) return;
  // Treat parentheses in error patterns as literal text when needed.
  assert.match(text, new RegExp(matcher.source.replaceAll('()', '\\(\\)')));
}

export function expect(value: unknown): Expected {
  const toThrow = (expected?: RegExp | string): void => {
    let thrown: unknown;
    try {
      (value as () => unknown)();
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown !== undefined, 'Expected function to throw');
    if (expected !== undefined) assertErrorMatches(thrown, expected);
  };

  return {
    toBe: (expected) => assert.strictEqual(value, expected),
    toEqual: (expected) => assert.deepStrictEqual(value, expected),
    toContain: (expected) => assert.ok((value as string).includes(expected as string)),
    toBeGreaterThanOrEqual: (expected) => assert.ok((value as number) >= expected),
    toBeInstanceOf: (expected) => assert.ok(value instanceof expected),
    toThrow,
    not: {
      toBe: (expected) => assert.notStrictEqual(value, expected),
      toContain: (expected) => assert.ok(!(value as string).includes(expected as string)),
      toThrow: () => assert.doesNotThrow(value as () => unknown),
    },
    rejects: {
      toThrow: async (expected) => {
        let rejected: unknown;
        try {
          await (value as Promise<unknown>);
        } catch (error) {
          rejected = error;
        }
        assert.ok(rejected !== undefined, 'Expected promise to reject');
        if (expected !== undefined) assertErrorMatches(rejected, expected);
      },
    },
  };
}
