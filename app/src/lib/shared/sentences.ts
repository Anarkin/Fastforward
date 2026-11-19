type Named = {
  readonly name: string;
  readonly path?: 'file' | 'folder';
  readonly root?: string;
};

export type Value = Named | { readonly text: string };

export type Line = Value & { readonly label?: string };

export type Sentence = string | readonly (string | Named)[];

export const labeled = (label: string, value: Value): Line => ({
  label,
  ...value,
});

export const named = (name: string): Named => ({ name });

export const namedFile = (path: string, root?: string): Named => ({
  name: path,
  path: 'file',
  ...(root !== undefined && { root }),
});

export const namedFolder = (path: string, root?: string): Named => ({
  name: path,
  path: 'folder',
  ...(root !== undefined && { root }),
});

export const namedItem = (
  item: string,
  kind: 'file' | 'folder' = 'file',
): Named => ({ name: item, path: kind });

export const namesBetween = (names: readonly string[], between: string) =>
  names.flatMap((name, index) =>
    index === 0 ? [named(name)] : [between, named(name)],
  );

const quoted = (name: string) => `"${name}"`;

export const sentencesOf = (
  all: readonly Sentence[],
  between = ' ',
): Sentence =>
  all.reduce<Sentence>(
    (joined, one) =>
      joined === '' ? one : sentence`${joined}${between}${one}`,
    '',
  );

export const plainOf = (said: Sentence): string =>
  typeof said === 'string'
    ? said
    : said
        .map((part) => (typeof part === 'string' ? part : quoted(part.name)))
        .join('');

const partsOf = (piece: Sentence | Value): readonly (string | Named)[] =>
  typeof piece === 'string'
    ? [piece]
    : 'name' in piece
      ? [
          piece.path === undefined
            ? named(piece.name)
            : {
                name: piece.name,
                path: piece.path,
                ...(piece.root !== undefined && { root: piece.root }),
              },
        ]
      : 'text' in piece
        ? [piece.text]
        : piece;

export const sentence = (
  texts: TemplateStringsArray,
  ...pieces: readonly (Sentence | Value)[]
): Sentence => {
  const parts = texts
    .flatMap((text, index) => [
      text,
      ...(index < pieces.length ? partsOf(pieces[index]) : []),
    ])
    .reduce<(string | Named)[]>((joined, part) => {
      const last = joined.at(-1);
      if (typeof part === 'string' && typeof last === 'string') {
        joined[joined.length - 1] = last + part;
      } else if (part !== '') {
        joined.push(part);
      }
      return joined;
    }, []);
  return parts.every((part) => typeof part === 'string')
    ? parts.join('')
    : parts;
};
