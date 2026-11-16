type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

export interface Schema<T> {
  readonly decode: (value: unknown) => T | undefined;
  readonly encode: (value: T) => Json | undefined;
}

export interface Optional<T> {
  readonly optional: Schema<T>;
}

export type Infer<S> = S extends Schema<infer T> ? T : never;

interface AnySchema {
  readonly decode: (value: unknown) => unknown;
  readonly encode: (value: never) => Json | undefined;
}

interface AnyOptional {
  readonly optional: AnySchema;
}

type Fields = Readonly<Record<string, AnySchema | AnyOptional>>;

type Expanded<T> = { readonly [K in keyof T]: T[K] };

type Needed<F extends Fields> = {
  readonly [K in keyof F as F[K] extends AnyOptional ? never : K]: Infer<F[K]>;
};

type Optionals<F extends Fields> = {
  readonly [
    K in keyof F as F[K] extends AnyOptional ? K : never
  ]?: F[K] extends Optional<infer T> ? T : never;
};

export type RecordOf<F extends Fields> = Expanded<Needed<F> & Optionals<F>>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text({ max }: { readonly max?: number } = {}): Schema<string> {
  const fits = (value: string) => max === undefined || value.length <= max;
  return {
    decode: (value) =>
      typeof value === 'string' && fits(value) ? value : undefined,
    encode: (value) => (fits(value) ? value : undefined),
  };
}

export function count({
  min = -Infinity,
  max = Infinity,
  integer = false,
}: {
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
} = {}): Schema<number> {
  const fits = (value: unknown): value is number =>
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max &&
    (!integer || Number.isSafeInteger(value));
  return {
    decode: (value) => (fits(value) ? value : undefined),
    encode: (value) => (fits(value) ? value : undefined),
  };
}

export function flag(): Schema<boolean> {
  return {
    decode: (value) => (typeof value === 'boolean' ? value : undefined),
    encode: (value) => value,
  };
}

export function oneOf<const V extends string | number | boolean>(
  values: readonly V[],
): Schema<V> {
  return {
    decode: (value) => values.find((each) => each === value),
    encode: (value) => value,
  };
}

export function optional<T>(schema: Schema<T>): Optional<T> {
  return { optional: schema };
}

export function never<T>(): Optional<T> {
  return {
    optional: { decode: () => undefined, encode: () => undefined },
  };
}

function schemaOf(field: AnySchema | AnyOptional): Schema<unknown> {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return ('optional' in field ? field.optional : field) as Schema<unknown>;
}

export function record<const F extends Fields>(fields: F): Schema<RecordOf<F>> {
  const entries = Object.entries(fields).map(
    ([name, field]) => [name, schemaOf(field), 'optional' in field] as const,
  );
  return {
    decode: (value) => {
      if (!isRecord(value)) {
        return undefined;
      }
      const decoded: Record<string, unknown> = {};
      for (const [name, schema, isOptional] of entries) {
        const field = Object.hasOwn(value, name)
          ? schema.decode(value[name])
          : undefined;
        if (field !== undefined) {
          decoded[name] = field;
        } else if (!isOptional) {
          return undefined;
        }
      }
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      return decoded as RecordOf<F>;
    },
    encode: (value) => {
      const given: Readonly<Record<string, unknown>> = value;
      const encoded: Record<string, Json> = {};
      for (const [name, schema, isOptional] of entries) {
        const field =
          given[name] === undefined ? undefined : schema.encode(given[name]);
        if (field !== undefined) {
          encoded[name] = field;
        } else if (!isOptional) {
          return undefined;
        }
      }
      return encoded;
    },
  };
}

function kept<T>(items: readonly T[], max: number | undefined): readonly T[] {
  return max === undefined
    ? items
    : items.slice(Math.max(0, items.length - max));
}

export function list<T>(
  item: Schema<T>,
  {
    max,
    whole = false,
  }: { readonly max?: number; readonly whole?: boolean } = {},
): Schema<readonly T[]> {
  return {
    decode: (value) => {
      if (!Array.isArray(value)) {
        return undefined;
      }
      if (whole && max !== undefined && value.length > max) {
        return undefined;
      }
      const decoded: T[] = [];
      for (const each of value) {
        const one = item.decode(each);
        if (one !== undefined) {
          decoded.push(one);
        } else if (whole) {
          return undefined;
        }
      }
      return kept(decoded, max);
    },
    encode: (value) => {
      if (whole && max !== undefined && value.length > max) {
        return undefined;
      }
      const encoded: Json[] = [];
      for (const each of kept(value, max)) {
        const one = item.encode(each);
        if (one !== undefined) {
          encoded.push(one);
        } else if (whole) {
          return undefined;
        }
      }
      return encoded;
    },
  };
}

export function keyed<K, V>(
  key: Schema<K>,
  value: Schema<V>,
  { max }: { readonly max?: number } = {},
): Schema<ReadonlyMap<K, V>> {
  const entry: Schema<readonly [K, V]> = {
    decode: (each) => {
      if (!Array.isArray(each) || each.length !== 2) {
        return undefined;
      }
      const [named, held]: unknown[] = each;
      const decodedKey = key.decode(named);
      const decodedValue = value.decode(held);
      return decodedKey === undefined || decodedValue === undefined
        ? undefined
        : [decodedKey, decodedValue];
    },
    encode: ([named, held]) => {
      const encodedKey = key.encode(named);
      const encodedValue = value.encode(held);
      return encodedKey === undefined || encodedValue === undefined
        ? undefined
        : [encodedKey, encodedValue];
    },
  };
  const entries = list(entry, { max });
  return {
    decode: (each) => {
      const decoded = entries.decode(each);
      return decoded === undefined ? undefined : new Map(decoded);
    },
    encode: (map) => entries.encode([...map]),
  };
}

export function set<T>(
  item: Schema<T>,
  { max }: { readonly max?: number } = {},
): Schema<ReadonlySet<T>> {
  const items = list(item, { max });
  return {
    decode: (value) => {
      const decoded = items.decode(value);
      return decoded === undefined ? undefined : new Set(decoded);
    },
    encode: (value) => items.encode([...value]),
  };
}

export function bounded<T>(
  schema: Schema<T>,
  { chars }: { readonly chars: number },
): Schema<T> {
  const fits = (encoded: Json | undefined) =>
    encoded !== undefined && JSON.stringify(encoded).length <= chars;
  return {
    decode: (value) => {
      const decoded = schema.decode(value);
      return decoded !== undefined && fits(schema.encode(decoded))
        ? decoded
        : undefined;
    },
    encode: (value) => {
      const encoded = schema.encode(value);
      return fits(encoded) ? encoded : undefined;
    },
  };
}
