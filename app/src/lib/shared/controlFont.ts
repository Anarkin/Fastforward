export const controlFontFamily = 'Fastforward Controls';

export const controlNames = [
  'NUL',
  'SOH',
  'STX',
  'ETX',
  'EOT',
  'ENQ',
  'ACK',
  'BEL',
  'BS',
  'HT',
  'LF',
  'VT',
  'FF',
  'CR',
  'SO',
  'SI',
  'DLE',
  'DC1',
  'DC2',
  'DC3',
  'DC4',
  'NAK',
  'SYN',
  'ETB',
  'CAN',
  'EM',
  'SUB',
  'ESC',
  'FS',
  'GS',
  'RS',
  'US',
] as const;

export const spaceName = 'SP';

export const deleteName = 'DEL';

const deleteCode = 0x7f;

const firstPicture = 0x2400;

const spacePicture = 0x2420;

const deletePicture = 0x2421;

const tab = 9;
const lineFeed = 10;
export const formFeed = 12;
const carriageReturn = 13;

const drawnByTheViews = new Set([tab, lineFeed, carriageReturn]);

export const controlCodes: readonly number[] = [
  ...controlNames
    .map((_, code) => code)
    .filter((code) => !drawnByTheViews.has(code)),
  deleteCode,
];

export const pictureOfControl = (code: number): number =>
  code === deleteCode ? deletePicture : firstPicture + code;

export const controlOfPicture = (picture: number): number =>
  picture === deletePicture ? deleteCode : picture - firstPicture;

export const codesOfControlFont: readonly number[] = [
  ...controlCodes.filter((code) => code !== formFeed),
  ...Array.from(
    { length: deletePicture - firstPicture + 1 },
    (_, at) => firstPicture + at,
  ),
];

export function nameOfControlFontCode(code: number): string {
  if (code === deleteCode || code === deletePicture) {
    return deleteName;
  }
  if (code === spacePicture) {
    return spaceName;
  }
  return controlNames[code >= firstPicture ? code - firstPicture : code] ?? '';
}

const hex = (code: number) => code.toString(16).toUpperCase();

export function unicodeRangeOf(codes: readonly number[]): string {
  const ranges: [number, number][] = [];
  for (const code of codes.toSorted((one, other) => one - other)) {
    const last = ranges.at(-1);
    if (last !== undefined && code === last[1] + 1) {
      last[1] = code;
    } else {
      ranges.push([code, code]);
    }
  }
  return ranges
    .map(([from, to]) =>
      from === to ? `U+${hex(from)}` : `U+${hex(from)}-${hex(to)}`,
    )
    .join(', ');
}
