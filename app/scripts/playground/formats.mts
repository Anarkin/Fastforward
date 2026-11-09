import { createHash } from 'node:crypto';
import { deflateRawSync, gzipSync } from 'node:zlib';
import { crc32, crcOfByte } from './samples.mts';

export interface Packed {
  readonly name: string | Buffer;
  readonly content: string | Buffer;
}

const dosDate = ((2026 - 1980) << 9) | (2 << 5) | 1;

const zipCrypto = (password: string, crc: number, data: Buffer) => {
  const keys = [0x12345678, 0x23456789, 0x34567890];
  const update = (byte: number) => {
    keys[0] = crcOfByte(keys[0], byte);
    keys[1] =
      (Math.imul((keys[1] + (keys[0] & 0xff)) | 0, 134_775_813) + 1) >>> 0;
    keys[2] = crcOfByte(keys[2], keys[1] >>> 24);
  };
  for (const byte of Buffer.from(password)) {
    update(byte);
  }
  const header = Buffer.alloc(12, 0x5a);
  header[11] = crc >>> 24;
  const plain = Buffer.concat([header, data]);
  const encrypted = Buffer.alloc(plain.length);
  for (const [at, byte] of plain.entries()) {
    const temp = (keys[2] | 2) & 0xffff;
    encrypted[at] = byte ^ ((Math.imul(temp, temp ^ 1) >>> 8) & 0xff);
    update(byte);
  }
  return encrypted;
};

export const zip = (files: readonly Packed[], password?: string) => {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const { name, content } of files) {
    const data = Buffer.from(content);
    const crc = crc32(data);
    const deflated = deflateRawSync(data);
    const packed =
      password === undefined ? deflated : zipCrypto(password, crc, deflated);
    const nameBytes = Buffer.from(name);
    const flags =
      (typeof name === 'string' ? 0x0800 : 0) |
      (password === undefined ? 0 : 1);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    parts.push(local, nameBytes, packed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const listed = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(listed.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, listed, end]);
};

const octal = (value: number, width: number) =>
  `${value.toString(8).padStart(width - 1, '0')}\0`;

export const tar = (files: readonly Packed[]) => {
  const blocks: Buffer[] = [];
  for (const { name, content } of files) {
    const data = Buffer.from(content);
    const header = Buffer.alloc(512);
    Buffer.from(name).copy(header, 0, 0, 100);
    header.write(octal(0o644, 8), 100);
    header.write(octal(0, 8), 108);
    header.write(octal(0, 8), 116);
    header.write(octal(data.length, 12), 124);
    header.write(octal(1_769_904_000, 12), 136);
    header.write(' '.repeat(8), 148);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
};

export const gzip = (content: string | Buffer) =>
  gzipSync(Buffer.from(content), { level: 9 });

const contentTypes = (overrides: Readonly<Record<string, string>>) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${Object.entries(
    overrides,
  )
    .map(
      ([part, type]) => `<Override PartName="${part}" ContentType="${type}"/>`,
    )
    .join('')}</Types>`;

const relationships = (targets: readonly (readonly [string, string])[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${targets
    .map(
      ([type, target], i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`,
    )
    .join('')}</Relationships>`;

const escapedXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export const docx = (paragraphs: readonly string[]) =>
  zip([
    {
      name: '[Content_Types].xml',
      content: contentTypes({
        '/word/document.xml':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
      }),
    },
    {
      name: '_rels/.rels',
      content: relationships([['officeDocument', 'word/document.xml']]),
    },
    {
      name: 'word/document.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
        .map((text) => `<w:p><w:r><w:t>${escapedXml(text)}</w:t></w:r></w:p>`)
        .join('')}</w:body></w:document>`,
    },
  ]);

const column = (index: number) => String.fromCodePoint(65 + index);

export const xlsx = (rows: readonly (readonly (string | number)[])[]) =>
  zip([
    {
      name: '[Content_Types].xml',
      content: contentTypes({
        '/xl/workbook.xml':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
        '/xl/worksheets/sheet1.xml':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml',
      }),
    },
    {
      name: '_rels/.rels',
      content: relationships([['officeDocument', 'xl/workbook.xml']]),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: relationships([['worksheet', 'worksheets/sheet1.xml']]),
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Playground" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows
        .map(
          (cells, row) =>
            `<row r="${row + 1}">${cells
              .map((cell, index) =>
                typeof cell === 'number'
                  ? `<c r="${column(index)}${row + 1}"><v>${cell}</v></c>`
                  : `<c r="${column(index)}${row + 1}" t="inlineStr"><is><t>${escapedXml(cell)}</t></is></c>`,
              )
              .join('')}</row>`,
        )
        .join('')}</sheetData></worksheet>`,
    },
  ]);

const rc4 = (key: Buffer, data: Buffer) => {
  const state = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + state[i]) & 0xff;
    [state[i], state[j]] = [state[j], state[i]];
    out[k] = data[k] ^ state[(state[i] + state[j]) & 0xff];
  }
  return out;
};

const md5 = (...parts: readonly Buffer[]) =>
  createHash('md5').update(Buffer.concat(parts)).digest();

const passwordPadding = Buffer.from(
  '28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A',
  'hex',
);

const padded = (password: string) =>
  Buffer.concat([Buffer.from(password, 'latin1'), passwordPadding]).subarray(
    0,
    32,
  );

const pdfString = (text: string) =>
  text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');

export interface PdfPage {
  readonly lines: readonly string[];
  readonly drawing?: string;
}

export const pdfParts = (
  pages: Iterable<PdfPage>,
  count: number,
  password?: string,
): Buffer[] => {
  const id = md5(Buffer.from(`fastforward playground ${count} ${password}`));
  const permissions = -4;
  let key: Buffer | undefined;
  let encryption = '';
  if (password !== undefined) {
    const owner = rc4(md5(padded(password)).subarray(0, 5), padded(password));
    const allowed = Buffer.alloc(4);
    allowed.writeInt32LE(permissions);
    key = md5(padded(password), owner, allowed, id).subarray(0, 5);
    const user = rc4(key, passwordPadding);
    encryption = ` /Encrypt << /Filter /Standard /V 1 /R 2 /O <${owner.toString('hex')}> /U <${user.toString('hex')}> /P ${permissions} >>`;
  }
  const parts: Buffer[] = [
    Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n', 'latin1'),
  ];
  const offsets: number[] = [];
  let length = parts[0].length;
  const object = (number: number, body: Buffer | string) => {
    offsets[number] = length;
    const bytes = Buffer.concat([
      Buffer.from(`${number} 0 obj\n`),
      Buffer.from(body),
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(bytes);
    length += bytes.length;
  };
  const pageNumbers = Array.from({ length: count }, (_, i) => 4 + i * 2);
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(
    2,
    `<< /Type /Pages /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] /Count ${count} >>`,
  );
  object(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let index = 0;
  for (const { lines, drawing = '' } of pages) {
    const number = pageNumbers[index++];
    object(
      number,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${number + 1} 0 R >>`,
    );
    const content = Buffer.from(
      `${drawing}0 g BT /F1 12 Tf 16 TL 72 756 Td ${lines.map((line) => `(${pdfString(line)}) '`).join(' ')} ET\n`,
      'latin1',
    );
    const salt = Buffer.from([
      (number + 1) & 0xff,
      ((number + 1) >> 8) & 0xff,
      ((number + 1) >> 16) & 0xff,
      0,
      0,
    ]);
    const stream =
      key === undefined
        ? content
        : rc4(md5(key, salt).subarray(0, key.length + 5), content);
    object(
      number + 1,
      Buffer.concat([
        Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),
        stream,
        Buffer.from('\nendstream'),
      ]),
    );
  }
  const size = 4 + count * 2;
  const xref = [
    `xref\n0 ${size}\n0000000000 65535 f \n`,
    ...Array.from(
      { length: size - 1 },
      (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`,
    ),
    `trailer\n<< /Size ${size} /Root 1 0 R /ID [<${id.toString('hex')}> <${id.toString('hex')}>]${encryption} >>\nstartxref\n${length}\n%%EOF\n`,
  ].join('');
  parts.push(Buffer.from(xref));
  return parts;
};

export const pdf = (pages: readonly PdfPage[], password?: string) =>
  Buffer.concat(pdfParts(pages, pages.length, password));

export const wav = (seconds: number, frequency: number) => {
  const rate = 8000;
  const data = Buffer.alloc(rate * seconds * 2);
  for (let i = 0; i < rate * seconds; i++) {
    data.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * 8000),
      i * 2,
    );
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

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
