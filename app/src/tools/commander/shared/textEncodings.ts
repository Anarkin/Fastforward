export const textEncodings = [
  'utf-8',
  'utf-16le',
  'utf-16be',
  'windows-1252',
  'windows-1250',
  'windows-1251',
  'windows-1253',
  'windows-1254',
  'windows-1255',
  'windows-1256',
  'windows-1257',
  'windows-1258',
  'windows-874',
  'iso-8859-2',
  'iso-8859-3',
  'iso-8859-4',
  'iso-8859-5',
  'iso-8859-6',
  'iso-8859-7',
  'iso-8859-8',
  'iso-8859-8-i',
  'iso-8859-10',
  'iso-8859-13',
  'iso-8859-14',
  'iso-8859-15',
  'iso-8859-16',
  'koi8-r',
  'koi8-u',
  'ibm866',
  'macintosh',
  'x-mac-cyrillic',
] as const;

export type TextEncoding = (typeof textEncodings)[number];

export function isTextEncoding(value: unknown): value is TextEncoding {
  return textEncodings.some((encoding) => encoding === value);
}
