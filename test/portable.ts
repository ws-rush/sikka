export const PORTABLE_SEED = 0x53494b4b;
export const PORTABLE_RUNS = 100;

export interface PortableDomain<T> {
  sample(generator: PortableGenerator): T;
  map<U>(transform: (value: T) => U): PortableDomain<U>;
  filter(predicate: (value: T) => boolean): PortableDomain<T>;
}

function domain<T>(sample: (generator: PortableGenerator) => T): PortableDomain<T> {
  return {
    sample,
    map: (transform) => domain((generator) => transform(sample(generator))),
    filter: (predicate) =>
      domain((generator) => {
        for (let attempt = 0; attempt < 100; attempt++) {
          const value = sample(generator);
          if (predicate(value)) return value;
        }
        throw new Error('Portable domain predicate did not match');
      }),
  };
}

export class PortableGenerator {
  #state: number;

  constructor(seed = PORTABLE_SEED) {
    this.#state = seed || PORTABLE_SEED;
  }

  string(minLength = 0, maxLength = 20): PortableDomain<string> {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 &<>"\'';
    return domain((generator) => {
      let value = '';
      const length = generator.#integer(minLength, maxLength);
      for (let index = 0; index < length; index++)
        value += characters[generator.#integer(0, characters.length - 1)];
      return value;
    });
  }

  array<T>(value: PortableDomain<T>, maxLength = 8): PortableDomain<T[]> {
    return domain((generator) =>
      Array.from({ length: generator.#integer(0, maxLength) }, () => value.sample(generator))
    );
  }

  object<T extends Record<string, PortableDomain<unknown>>>(
    shape: T
  ): PortableDomain<{
    [Key in keyof T]: T[Key] extends PortableDomain<infer Value> ? Value : never;
  }> {
    return domain((generator) => {
      const result: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) result[key] = shape[key].sample(generator);
      return result as {
        [Key in keyof T]: T[Key] extends PortableDomain<infer Value> ? Value : never;
      };
    });
  }

  #integer(minimum: number, maximum: number): number {
    this.#state ^= this.#state << 13;
    this.#state ^= this.#state >>> 17;
    this.#state ^= this.#state << 5;
    this.#state >>>= 0;
    return minimum + (this.#state % (maximum - minimum + 1));
  }
}

export function runPortableProperty<T>(
  id: string,
  input: PortableDomain<T>,
  predicate: (value: T) => void
): void {
  const generator = new PortableGenerator();
  for (let run = 1; run <= PORTABLE_RUNS; run++) {
    const value = input.sample(generator);
    try {
      predicate(value);
    } catch (error) {
      throw new Error(
        `Portable property ${id} failed: seed 0x${PORTABLE_SEED.toString(16)}, run ${run}, input ${JSON.stringify(value)}`,
        { cause: error }
      );
    }
  }
}
