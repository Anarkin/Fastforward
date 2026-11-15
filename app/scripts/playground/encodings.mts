const tables = new Map<string, ReadonlyMap<string, number>>();

const tableOf = (encoding: string) => {
  const known = tables.get(encoding);
  if (known !== undefined) {
    return known;
  }
  const decoder = new TextDecoder(encoding);
  const table = new Map<string, number>();
  for (let byte = 0; byte < 256; byte++) {
    const character = decoder.decode(Uint8Array.of(byte));
    if (character !== '�' && !table.has(character)) {
      table.set(character, byte);
    }
  }
  tables.set(encoding, table);
  return table;
};

const singleBytes = (character: string, table: ReadonlyMap<string, number>) => {
  const direct = table.get(character);
  if (direct !== undefined) {
    return [direct];
  }
  const [base, ...marks] = Array.from(character.normalize('NFD'));
  for (const order of orders(marks)) {
    const parts = [base, ...order];
    for (let take = parts.length; take > 0; take--) {
      const head = table.get(parts.slice(0, take).join('').normalize('NFC'));
      const rest = parts.slice(take).map((part) => table.get(part));
      if (head !== undefined && rest.every((byte) => byte !== undefined)) {
        return [head, ...rest];
      }
    }
  }
  return undefined;
};

const orders = (marks: readonly string[]): string[][] =>
  marks.length <= 1
    ? [[...marks]]
    : marks.flatMap((mark, i) =>
        orders(marks.filter((_, k) => k !== i)).map((rest) => [mark, ...rest]),
      );

export const encoded = (text: string, encoding: string): Buffer => {
  switch (encoding) {
    case 'utf-8':
      return Buffer.from(text);
    case 'utf-16le':
      return Buffer.from(text, 'utf16le');
    case 'utf-16be':
      return Buffer.from(text, 'utf16le').swap16();
    default: {
      const table = tableOf(encoding);
      return Buffer.from(
        Array.from(text).flatMap((character) => {
          const bytes = singleBytes(character, table);
          if (bytes === undefined) {
            throw new Error(`${encoding} can't encode ${character}.`);
          }
          return bytes;
        }),
      );
    }
  }
};

export const hungarianOf852: Readonly<Record<string, number>> = {
  á: 0xa0,
  é: 0x82,
  í: 0xa1,
  ó: 0xa2,
  ö: 0x94,
  ő: 0x8b,
  ú: 0xa3,
  ü: 0x81,
  ű: 0xfb,
};

export const codePage852 = (name: string) =>
  Buffer.from(
    name
      .split('')
      .map((character) => hungarianOf852[character] ?? character.charCodeAt(0)),
  );
